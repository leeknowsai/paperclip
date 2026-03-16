// TG group sync job: scrape messages and members from Telegram groups via CDP,
// upsert into local DB, detect lead conversions when a lead's TG handle joins a group.

import type { PluginContext } from "@paperclipai/plugin-sdk";
import { getDb } from "../db/index.js";
import { STATE_KEYS, EVENT_NAMES } from "../constants.js";
import {
  launchTgSession,
  getGroupMessages,
  getGroupMembers,
} from "../lib/tg-web-client.js";
import {
  projects,
  tgGroupMessages,
  tgGroupMembers,
  leads,
} from "../db/schema.js";
import { eq, and, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";

export async function handleTgGroupSync(ctx: PluginContext): Promise<void> {
  // 1. Check if TG sync enabled
  const config = ctx.config as any;
  if (!config?.tgSyncEnabled) {
    ctx.logger.info("TG sync disabled, skipping");
    return;
  }

  // 2. Connect to Chrome CDP
  const cdpPort = config.cdpPort ?? 9222;
  let session: { wsUrl: string };
  try {
    session = await launchTgSession(cdpPort);
  } catch (e: any) {
    ctx.logger.error(`Failed to connect to Chrome CDP: ${e.message}`);
    return;
  }

  // 3. Restore saved TG session if available
  const sessionData = await ctx.state.get(STATE_KEYS.tgSession);
  if (sessionData) {
    ctx.logger.info("Found saved TG session data");
  }

  const db = getDb();

  // 4. For each project with tgGroupId
  const projectsWithTg = db
    .select()
    .from(projects)
    .where(sql`${projects.tgGroupId} IS NOT NULL`)
    .all();

  if (projectsWithTg.length === 0) {
    ctx.logger.info("No projects with TG groups configured");
    return;
  }

  for (const project of projectsWithTg) {
    const groupId = project.tgGroupId!;
    ctx.logger.info(`Syncing TG group ${groupId} for project ${project.name}`);

    try {
      // 5. Scrape messages
      const lastMsg = db
        .select()
        .from(tgGroupMessages)
        .where(eq(tgGroupMessages.groupId, groupId))
        .orderBy(sql`${tgGroupMessages.createdAt} DESC`)
        .limit(1)
        .all();

      const since =
        lastMsg.length > 0 && lastMsg[0].createdAt
          ? lastMsg[0].createdAt instanceof Date
            ? lastMsg[0].createdAt.toISOString()
            : new Date(lastMsg[0].createdAt as any).toISOString()
          : undefined;

      const messages = await getGroupMessages(session.wsUrl, groupId, since);

      let insertedCount = 0;
      for (const msg of messages) {
        // Check if message already exists (id is the synthetic id from scraper)
        const existing = db
          .select()
          .from(tgGroupMessages)
          .where(eq(tgGroupMessages.id, msg.id))
          .all();
        if (existing.length > 0) continue;

        db.insert(tgGroupMessages)
          .values({
            id: msg.id,
            groupId: msg.groupId,
            projectId: project.id,
            senderUsername: msg.senderUsername,
            text: msg.text,
            messageType: "text",
            createdAt: new Date(msg.timestamp),
            syncedAt: new Date(),
          })
          .run();
        insertedCount++;

        // Emit tg-message event
        ctx.events.emit(EVENT_NAMES.tgMessage, {
          groupId,
          projectId: project.id,
          sender: {
            username: msg.senderUsername,
            displayName: msg.senderDisplayName,
          },
          text: msg.text,
          timestamp: msg.timestamp,
        });
      }
      ctx.logger.info(
        `Inserted ${insertedCount} new messages for group ${groupId}`,
      );

      // 6. Scrape members
      const members = await getGroupMembers(session.wsUrl, groupId);

      let newMemberCount = 0;
      for (const member of members) {
        if (!member.username) continue;

        // Upsert member
        const existingMember = db
          .select()
          .from(tgGroupMembers)
          .where(
            and(
              eq(tgGroupMembers.groupId, groupId),
              eq(tgGroupMembers.username, member.username),
            ),
          )
          .all();

        if (existingMember.length === 0) {
          // New member — check if matches a lead's detectedTgHandle
          const matchingLead = db
            .select()
            .from(leads)
            .where(
              and(
                eq(leads.projectId, project.id),
                sql`LOWER(${leads.detectedTgHandle}) = LOWER(${member.username})`,
              ),
            )
            .all();

          const isLead = matchingLead.length > 0;
          const now = new Date();

          db.insert(tgGroupMembers)
            .values({
              id: randomUUID(),
              groupId,
              projectId: project.id,
              userId: member.username, // best we have from DOM scraping
              username: member.username,
              displayName: member.displayName,
              leadId: isLead ? matchingLead[0].id : null,
              status: "member",
              joinedAt: now,
              syncedAt: now,
            })
            .run();
          newMemberCount++;

          // Emit tg-member-joined event
          ctx.events.emit(EVENT_NAMES.tgMemberJoined, {
            groupId,
            projectId: project.id,
            username: member.username,
            isLead,
            leadId: isLead ? matchingLead[0].id : undefined,
          });

          // If matches a lead, update lead status to converted
          if (isLead) {
            const lead = matchingLead[0];
            db.update(leads)
              .set({
                status: "converted",
                tgGroupJoined: true,
                updatedAt: new Date(),
              })
              .where(eq(leads.id, lead.id))
              .run();

            ctx.events.emit(EVENT_NAMES.leadConverted, {
              leadId: lead.id,
              handle: lead.handle,
              projectId: project.id,
              tgUsername: member.username,
            });
            ctx.logger.info(
              `Lead ${lead.handle} converted — joined TG as @${member.username}`,
            );
          }
        } else {
          // Update existing member
          db.update(tgGroupMembers)
            .set({
              displayName: member.displayName,
              syncedAt: new Date(),
            })
            .where(
              and(
                eq(tgGroupMembers.groupId, groupId),
                eq(tgGroupMembers.username, member.username),
              ),
            )
            .run();
        }
      }
      ctx.logger.info(
        `Synced ${members.length} members (${newMemberCount} new) for group ${groupId}`,
      );
    } catch (e: any) {
      ctx.logger.error(`Error syncing group ${groupId}: ${e.message}`);
    }
  }
}

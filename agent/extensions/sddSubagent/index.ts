/*
Author: wilbur
Version: 1.3
Date: 2026-06-03
Description: Replace fragile double theme casts (as unknown as) with shared RenderTheme interface import.
*/

import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { buildPrompt } from "./promptBuilder.ts";
import { resolveModelId } from "./modelResolver.ts";
import { getWriteLockKey, resolveRoleConfig, type SubagentRole } from "./sddConfig.ts";
import { renderSddCall, renderSddResult, renderSddWidget, type RenderTheme } from "./subagentRender.ts";
import { runSubagent } from "./subagentRunner.ts";
import { addTask, completeTask, getTasks, reset as resetTracker, updateTaskOutput } from "./taskTracker.ts";

const RoleSchema = StringEnum(["implementer", "fixer", "specReviewer", "codeQualityReviewer", "finalReviewer"] as const, {
	description: "SDD subagent role to run.",
});

const ThinkingSchema = StringEnum(["off", "minimal", "low", "medium", "high", "xhigh"] as const, {
	description: "Thinking level for the child Pi process.",
});

const ParamsSchema = Type.Object({
	role: RoleSchema,
	taskId: Type.Optional(Type.String({ description: "Plan task id, such as 1 or 2.3." })),
	taskTitle: Type.Optional(Type.String({ description: "Short task title for display." })),
	taskText: Type.String({ description: "Full task text. Do not ask the child agent to read the plan file." }),
	context: Type.Optional(Type.String({ description: "Scene-setting context curated by the main Agent." })),
	implementerReport: Type.Optional(Type.String({ description: "Report from the implementer for reviewer roles." })),
	reviewFeedback: Type.Optional(Type.String({ description: "Reviewer feedback to fix for fixer role." })),
	cwd: Type.Optional(Type.String({ description: "Working directory for the child Pi process. Defaults to parent cwd." })),
	model: Type.Optional(Type.String({ description: "Model override for this child run." })),
	thinkingLevel: Type.Optional(ThinkingSchema),
	tools: Type.Optional(Type.Array(Type.String(), { description: "Tool allowlist override. Reviewer roles are forced read-only." })),
	timeoutMs: Type.Optional(Type.Number({ description: "Child process timeout in milliseconds." })),
});

type ToolParams = {
	role: SubagentRole;
	taskId?: string;
	taskTitle?: string;
	taskText: string;
	context?: string;
	implementerReport?: string;
	reviewFeedback?: string;
	cwd?: string;
	model?: string;
	thinkingLevel?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
	tools?: string[];
	timeoutMs?: number;
};

const activeWriteLocks = new Set<string>();

function summarizeResult(role: SubagentRole, result: Awaited<ReturnType<typeof runSubagent>>): string {
	const headline = role === "implementer" || role === "fixer" ? `Status: ${result.status ?? "UNKNOWN"}` : `Decision: ${result.decision ?? "UNKNOWN"}`;
	const lines = [headline];
	if (result.stderr && result.exitCode !== 0) lines.push(`stderr: ${result.stderr}`);
	lines.push("");
	lines.push(result.finalText || "No final assistant text captured from child subagent.");
	return lines.join("\n");
}

export default function (pi: ExtensionAPI) {
	// Reset task tracker on each session start
	pi.on("session_start", () => {
		resetTracker();
	});

	pi.registerTool({
		name: "sdd_subagent",
		label: "SDD Subagent",
		description: [
			"Run one executable Subagent-Driven Development subagent in an isolated child Pi process.",
			"Use implementer or fixer for write-capable work.",
			"Use specReviewer, codeQualityReviewer, or finalReviewer for read-only review.",
			"Provide full task text and curated context; do not make the child read the plan file.",
		].join(" "),
		promptSnippet: "Run one SDD subagent role with isolated context, selected model, and structured status or review result.",
		promptGuidelines: [
			"Use sdd_subagent for Subagent-Driven Development tasks instead of manually implementing when the user asks for subagent-driven execution.",
			"Use sdd_subagent with role implementer for one task at a time and do not dispatch multiple write-capable subagents in parallel for the same cwd.",
			"Use sdd_subagent reviewer roles only after implementation output is available; reviewer roles are read-only.",
		],
		parameters: ParamsSchema,
		async execute(_toolCallId, params: ToolParams, signal, onUpdate, ctx) {
			const cwd = params.cwd && params.cwd.trim() ? params.cwd.trim() : ctx.cwd;

			// Resolve model ID against models.json (case-insensitive)
			const resolvedModel = params.model ? resolveModelId(params.model) : undefined;

			const roleConfig = resolveRoleConfig({
				role: params.role,
				model: resolvedModel,
				thinkingLevel: params.thinkingLevel,
				tools: params.tools,
				timeoutMs: params.timeoutMs,
			});

			const lockKey = getWriteLockKey(cwd);
			let lockAcquired = false;

			if (roleConfig.allowWrites) {
				if (activeWriteLocks.has(lockKey)) {
					return {
						content: [{ type: "text", text: `A write-capable SDD subagent is already running for ${lockKey}. Retry after it finishes.` }],
						details: { role: params.role, lockKey },
					};
				}
				activeWriteLocks.add(lockKey);
				lockAcquired = true;
			}

			// Register task in tracker and set up widget
			const taskLabel = params.taskTitle ?? (params.taskId ? `Task ${params.taskId}` : `${params.role}`);
			const taskId = addTask(taskLabel, params.role, resolvedModel);

			// Set persistent dashboard widget (below editor, near input)
			ctx.ui.setWidget("sdd-dashboard", (_tui, theme) => ({
				render: (w) => renderSddWidget(w, theme as RenderTheme),
				invalidate: () => {},
			}));

			try {
				const builtPrompt = buildPrompt({
					role: params.role,
					taskId: params.taskId,
					taskTitle: params.taskTitle,
					taskText: params.taskText,
					context: params.context,
					implementerReport: params.implementerReport,
					reviewFeedback: params.reviewFeedback,
					cwd,
				});

				const result = await runSubagent({
					cwd,
					roleConfig,
					systemPrompt: builtPrompt.systemPrompt,
					taskPrompt: builtPrompt.taskPrompt,
					signal,
					onUpdate: (partial) => {
						// Update task tracker with latest output for widget scrolling line
						updateTaskOutput(taskId, partial.finalText || "");
						onUpdate?.({
							content: [{ type: "text", text: partial.finalText || "SDD subagent running" }],
							details: partial,
						});
					},
				});

				// Mark task complete in tracker
				const taskStatus = result.exitCode === 0 ? "done" as const : "error" as const;
				completeTask(taskId, taskStatus, result.usage, result.model ?? resolvedModel);

				const summary = summarizeResult(params.role, result);
				return {
					content: [{ type: "text", text: summary }],
					details: {
						role: result.role,
						status: result.status,
						decision: result.decision,
						finalText: result.finalText,
						usage: result.usage,
						model: result.model ?? resolvedModel,
						exitCode: result.exitCode,
						stderr: result.stderr,
						tools: roleConfig.tools,
						allowWrites: roleConfig.allowWrites,
					},
					isError: result.exitCode !== 0,
				};
			} finally {
				if (lockAcquired) activeWriteLocks.delete(lockKey);
				// Ensure taskTracker never stays stuck in "running" state
				const tracked = getTasks().find((t) => t.id === taskId);
				if (tracked && tracked.status === "running") {
					completeTask(taskId, "error");
				}
			}
		},
		renderCall(args, theme) {
			return renderSddCall(args as Record<string, unknown>, theme as RenderTheme);
		},
		renderResult(result, _options, theme) {
			return renderSddResult(result as Parameters<typeof renderSddResult>[0], theme as RenderTheme);
		},
	});
}

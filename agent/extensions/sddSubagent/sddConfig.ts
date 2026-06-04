/*
Author: wilbur
Version: 1.0
Date: 2026-06-02
Description: Role policy and execution config resolution for the SDD subagent runner. Defaults defer to Pi settings unless a model is provided.
*/

export type SubagentRole = "implementer" | "fixer" | "specReviewer" | "codeQualityReviewer" | "finalReviewer";

export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

export interface RoleConfig {
	role: SubagentRole;
	model?: string;
	thinkingLevel: ThinkingLevel;
	tools: string[];
	allowWrites: boolean;
	timeoutMs: number;
}

export interface ResolveConfigInput {
	role: SubagentRole;
	model?: string;
	thinkingLevel?: ThinkingLevel;
	tools?: string[];
	timeoutMs?: number;
}

const defaultTimeoutMs = 30 * 60 * 1000;
const readOnlyTools = ["read", "grep", "find", "ls", "bash"];
const writeTools = ["read", "grep", "find", "ls", "bash", "edit", "write"];
const reviewerRoles: SubagentRole[] = ["specReviewer", "codeQualityReviewer", "finalReviewer"];

export const roleDefaults: Record<SubagentRole, RoleConfig> = {
	implementer: {
		role: "implementer",
		model: undefined,
		thinkingLevel: "medium",
		tools: writeTools,
		allowWrites: true,
		timeoutMs: defaultTimeoutMs,
	},
	fixer: {
		role: "fixer",
		model: undefined,
		thinkingLevel: "medium",
		tools: writeTools,
		allowWrites: true,
		timeoutMs: defaultTimeoutMs,
	},
	specReviewer: {
		role: "specReviewer",
		model: undefined,
		thinkingLevel: "medium",
		tools: readOnlyTools,
		allowWrites: false,
		timeoutMs: defaultTimeoutMs,
	},
	codeQualityReviewer: {
		role: "codeQualityReviewer",
		model: undefined,
		thinkingLevel: "high",
		tools: readOnlyTools,
		allowWrites: false,
		timeoutMs: defaultTimeoutMs,
	},
	finalReviewer: {
		role: "finalReviewer",
		model: undefined,
		thinkingLevel: "high",
		tools: readOnlyTools,
		allowWrites: false,
		timeoutMs: defaultTimeoutMs,
	},
};

export function isReviewerRole(role: SubagentRole): boolean {
	return reviewerRoles.includes(role);
}

export function normalizeTools(tools: string[]): string[] {
	const seen = new Set<string>();
	const normalized: string[] = [];
	for (const tool of tools) {
		const trimmed = tool.trim();
		if (!trimmed || seen.has(trimmed)) continue;
		seen.add(trimmed);
		normalized.push(trimmed);
	}
	return normalized;
}

export function sanitizeToolsForRole(role: SubagentRole, tools: string[]): string[] {
	const normalized = normalizeTools(tools);
	if (!isReviewerRole(role)) return normalized;
	return normalized.filter((tool) => tool !== "edit" && tool !== "write");
}

export function resolveRoleConfig(input: ResolveConfigInput): RoleConfig {
	const defaults = roleDefaults[input.role];
	const requestedTools = input.tools && input.tools.length > 0 ? input.tools : defaults.tools;
	return {
		role: input.role,
		model: input.model && input.model.trim() ? input.model.trim() : defaults.model,
		thinkingLevel: input.thinkingLevel ?? defaults.thinkingLevel,
		tools: sanitizeToolsForRole(input.role, requestedTools),
		allowWrites: defaults.allowWrites,
		timeoutMs: input.timeoutMs && input.timeoutMs > 0 ? input.timeoutMs : defaults.timeoutMs,
	};
}

export function getWriteLockKey(cwd: string): string {
	return cwd.trim() || process.cwd();
}

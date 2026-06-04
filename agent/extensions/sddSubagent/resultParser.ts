/*
Author: wilbur
Version: 1.1
Date: 2026-06-03
Description: Remove filesChanged parsing (was git-oriented). Keep all other parsing intact.
*/

import type { SubagentRole } from "./sddConfig.ts";

export interface UsageStats {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	cost: number;
	turns: number;
}

export interface TextPart {
	type: "text";
	text: string;
}

export interface ToolCallPart {
	type: "toolCall";
	name: string;
	arguments: Record<string, unknown>;
}

export type MessagePart = TextPart | ToolCallPart | Record<string, unknown>;

export interface ParsedMessage {
	role: string;
	content?: MessagePart[] | string;
	usage?: {
		input?: number;
		output?: number;
		cacheRead?: number;
		cacheWrite?: number;
		cost?: { total?: number };
	};
	model?: string;
}

export interface ParserState {
	messages: ParsedMessage[];
	toolCalls: Array<{ name: string; args: Record<string, unknown> }>;
	usage: UsageStats;
	model?: string;
	stderr: string;
}

export interface ParsedSubagentResult {
	role: SubagentRole;
	status?: "DONE" | "DONE_WITH_CONCERNS" | "BLOCKED" | "NEEDS_CONTEXT" | "UNKNOWN";
	decision?: "APPROVED" | "CHANGES_REQUESTED" | "UNKNOWN";
	finalText: string;
	usage: UsageStats;
	model?: string;
	exitCode: number;
	stderr: string;
}

export function createParserState(): ParserState {
	return {
		messages: [],
		toolCalls: [],
		usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0 },
		stderr: "",
	};
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function asParsedMessage(value: unknown): ParsedMessage | undefined {
	if (!isObject(value)) return undefined;
	if (typeof value.role !== "string") return undefined;
	return value as unknown as ParsedMessage;
}

function addUsage(state: ParserState, message: ParsedMessage): void {
	if (message.role !== "assistant") return;
	state.usage.turns += 1;
	const usage = message.usage;
	if (!usage) return;
	state.usage.input += usage.input ?? 0;
	state.usage.output += usage.output ?? 0;
	state.usage.cacheRead += usage.cacheRead ?? 0;
	state.usage.cacheWrite += usage.cacheWrite ?? 0;
	state.usage.cost += usage.cost?.total ?? 0;
	if (message.model) state.model = message.model;
}

export function handleJsonEvent(state: ParserState, event: unknown): void {
	if (!isObject(event)) return;
	if (event.type === "message_end") {
		const message = asParsedMessage(event.message);
		if (!message) return;
		state.messages.push(message);
		addUsage(state, message);
		return;
	}
	if (event.type === "tool_execution_start") {
		const toolName = typeof event.toolName === "string" ? event.toolName : "unknown";
		const args = isObject(event.args) ? event.args : {};
		state.toolCalls.push({ name: toolName, args });
	}
}

export function getFinalAssistantText(messages: ParsedMessage[]): string {
	for (let i = messages.length - 1; i >= 0; i -= 1) {
		const message = messages[i];
		if (message.role !== "assistant") continue;
		if (typeof message.content === "string") return message.content;
		if (!Array.isArray(message.content)) continue;
		for (const part of message.content) {
			if (part.type === "text" && typeof (part as TextPart).text === "string") return (part as TextPart).text;
		}
	}
	return "";
}

export function parseImplementerStatus(text: string): "DONE" | "DONE_WITH_CONCERNS" | "BLOCKED" | "NEEDS_CONTEXT" | "UNKNOWN" {
	const match = text.match(/^\s*Status:\s*(DONE_WITH_CONCERNS|DONE|BLOCKED|NEEDS_CONTEXT)\b/im);
	return match ? (match[1] as "DONE" | "DONE_WITH_CONCERNS" | "BLOCKED" | "NEEDS_CONTEXT") : "UNKNOWN";
}

export function parseReviewerDecision(text: string): "APPROVED" | "CHANGES_REQUESTED" | "UNKNOWN" {
	const match = text.match(/^\s*Decision:\s*(APPROVED|CHANGES_REQUESTED)\b/im);
	return match ? (match[1] as "APPROVED" | "CHANGES_REQUESTED") : "UNKNOWN";
}

export function buildParsedResult(role: SubagentRole, state: ParserState, exitCode: number): ParsedSubagentResult {
	const finalText = getFinalAssistantText(state.messages);
	const base = {
		role,
		finalText,
		usage: state.usage,
		model: state.model,
		exitCode,
		stderr: state.stderr,
	};
	if (role === "implementer" || role === "fixer") {
		return {
			status: parseImplementerStatus(finalText),
			...base,
		};
	}
	return {
		decision: parseReviewerDecision(finalText),
		...base,
	};
}

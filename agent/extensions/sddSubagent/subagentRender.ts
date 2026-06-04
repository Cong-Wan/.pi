/*
Author: wilbur
Version: 1.2
Date: 2026-06-03
Description: Export RenderTheme interface for type-safe theme casting in index.ts.
*/

import { Text, truncateToWidth } from "@earendil-works/pi-tui";
import { getTasks, getCurrentTask, getAggregateUsage } from "./taskTracker.ts";

export interface RenderTheme {
	fg(color: string, text: string): string;
	bold(text: string): string;
}

// ─── Per-call renderers (minimal, shown in conversation history) ───

export function renderSddCall(args: Record<string, unknown>, theme: RenderTheme): Text {
	const role = typeof args.role === "string" ? args.role : "unknown";
	const title = typeof args.taskTitle === "string" ? args.taskTitle : typeof args.taskId === "string" ? `Task ${args.taskId}` : "subagent task";
	const text = theme.fg("toolTitle", theme.bold("sdd_subagent ")) + theme.fg("accent", `${role}`) + theme.fg("dim", ` · ${title}`);
	return new Text(text, 0, 0);
}

export function renderSddResult(result: { details?: unknown; content: Array<{ type: string; text?: string }> }, theme: RenderTheme): Text {
	const details = result.details as Record<string, unknown> | undefined;
	if (!details) {
		const first = result.content[0];
		return new Text(first && first.type === "text" && first.text ? first.text : "sdd_subagent finished", 0, 0);
	}
	const statusOrDecision = (details.status ?? details.decision ?? "UNKNOWN") as string;
	const success = statusOrDecision === "DONE" || statusOrDecision === "DONE_WITH_CONCERNS" || statusOrDecision === "APPROVED";
	const icon = success ? theme.fg("success", "✓") : theme.fg("warning", "◐");
	const text = `${icon} ${theme.fg("toolTitle", theme.bold(details.role as string))} ${theme.fg("accent", statusOrDecision)}`;
	return new Text(text, 0, 0);
}

// ─── Dashboard widget (persistent, near input box) ───

export function renderSddWidget(width: number, theme: RenderTheme): string[] {
	const tasks = getTasks();
	if (tasks.length === 0) return [];

	const lines: string[] = [];
	const current = getCurrentTask();

	// Current task section (only when something is running)
	if (current) {
		const modelStr = current.model ? ` · ${current.model}` : "";
		const header = theme.fg("accent", theme.bold("▶ ")) + theme.fg("accent", current.label) + theme.fg("dim", modelStr);
		lines.push(truncateToWidth(header, width));

		if (current.lastOutput) {
			const outputLine = current.lastOutput.replace(/\n/g, " ").trim();
			const scrolling = theme.fg("dim", `  ${outputLine}`);
			lines.push(truncateToWidth(scrolling, width));
		}
	}

	// Task checklist
	for (const task of tasks) {
		let prefix: string;
		if (task.status === "running") {
			prefix = theme.fg("warning", "◻ ");
		} else if (task.status === "done") {
			prefix = theme.fg("success", "■ ");
		} else if (task.status === "error") {
			prefix = theme.fg("error", "✗ ");
		} else {
			prefix = theme.fg("dim", "◻ ");
		}
		const label = task.status === "done" ? theme.fg("muted", task.label) : task.label;
		lines.push(truncateToWidth(prefix + label, width));
	}

	// Aggregate usage footer
	const usage = getAggregateUsage();
	if (usage.turns > 0) {
		const usedModels = new Set<string>();
		for (const task of tasks) {
			if (task.model) usedModels.add(task.model);
		}
		const modelList = usedModels.size > 0 ? [...usedModels].join(", ") : "unknown";
		const usageStr = `${usage.turns} turns · ↑${usage.input} ↓${usage.output} · $${usage.cost.toFixed(4)} · ${modelList}`;
		lines.push(truncateToWidth(theme.fg("dim", usageStr), width));
	}

	return lines;
}

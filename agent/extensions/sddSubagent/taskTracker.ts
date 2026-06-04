/*
Author: wilbur
Version: 1.0
Date: 2026-06-03
Description: Shared task state tracker for the SDD dashboard widget. Tracks all tasks across sdd_subagent calls in a session.
*/

import type { UsageStats } from "./resultParser.ts";

export type TaskStatus = "pending" | "running" | "done" | "error";

export interface TaskEntry {
	id: string;
	label: string;
	role: string;
	model?: string;
	status: TaskStatus;
	usage?: UsageStats;
	lastOutput: string;
}

export interface AggregateUsage {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	cost: number;
	turns: number;
}

const tasks: TaskEntry[] = [];
const aggregateUsage: AggregateUsage = {
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0,
	cost: 0,
	turns: 0,
};
let taskCounter = 0;

export function addTask(label: string, role: string, model?: string): string {
	taskCounter++;
	const id = `sdd-task-${taskCounter}`;
	tasks.push({
		id,
		label,
		role,
		model,
		status: "running",
		lastOutput: "",
	});
	return id;
}

export function updateTaskOutput(id: string, output: string): void {
	const task = tasks.find((t) => t.id === id);
	if (!task) return;
	task.lastOutput = output;
}

export function completeTask(id: string, status: "done" | "error", usage?: UsageStats, model?: string): void {
	const task = tasks.find((t) => t.id === id);
	if (!task) return;
	task.status = status;
	if (model) task.model = model;
	if (usage) {
		task.usage = usage;
		aggregateUsage.input += usage.input;
		aggregateUsage.output += usage.output;
		aggregateUsage.cacheRead += usage.cacheRead;
		aggregateUsage.cacheWrite += usage.cacheWrite;
		aggregateUsage.cost += usage.cost;
		aggregateUsage.turns += usage.turns;
	}
}

export function getTasks(): readonly TaskEntry[] {
	return tasks;
}

export function getCurrentTask(): TaskEntry | undefined {
	return tasks.find((t) => t.status === "running");
}

export function getAggregateUsage(): AggregateUsage {
	return { ...aggregateUsage };
}

export function reset(): void {
	tasks.length = 0;
	aggregateUsage.input = 0;
	aggregateUsage.output = 0;
	aggregateUsage.cacheRead = 0;
	aggregateUsage.cacheWrite = 0;
	aggregateUsage.cost = 0;
	aggregateUsage.turns = 0;
	taskCounter = 0;
}

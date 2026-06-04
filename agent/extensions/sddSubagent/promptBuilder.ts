/*
Author: wilbur
Version: 1.1
Date: 2026-06-03
Description: Remove git SHA and commit references from all prompt templates.
*/

import type { SubagentRole } from "./sddConfig.ts";

export interface PromptInput {
	role: SubagentRole;
	taskId?: string;
	taskTitle?: string;
	taskText: string;
	context?: string;
	implementerReport?: string;
	reviewFeedback?: string;
	cwd: string;
}

export interface BuiltPrompt {
	systemPrompt: string;
	taskPrompt: string;
}

function section(title: string, body: string | undefined): string {
	const value = body && body.trim() ? body.trim() : "Not provided.";
	return `## ${title}\n\n${value}`;
}

function taskHeading(input: PromptInput): string {
	const parts: string[] = [];
	if (input.taskId) parts.push(`Task ${input.taskId}`);
	if (input.taskTitle) parts.push(input.taskTitle);
	return parts.length > 0 ? parts.join(": ") : "Assigned Task";
}

function buildImplementerPrompt(input: PromptInput, isFixer: boolean): string {
	const action = isFixer ? "fix the review feedback for" : "implement";
	const feedbackSection = isFixer ? `\n\n${section("Review Feedback To Fix", input.reviewFeedback)}` : "";
	return [
		`# Role\n\nYou are an SDD ${isFixer ? "fixer" : "implementer"} subagent. You operate in an isolated context window. You do not know the parent conversation. Use only the task, context, and repository state available to you.`,
		section("Assignment", `You must ${action} ${taskHeading(input)}.`),
		section("Task Description", input.taskText),
		section("Context", input.context),
		feedbackSection.trim(),
		section("Working Directory", input.cwd),
		`## Rules\n\n- Implement exactly what the task requires.\n- Do not add unrequested features.\n- If requirements are unclear, stop and return Status: NEEDS_CONTEXT.\n- If the task is blocked by complexity, missing information, or architectural uncertainty, return Status: BLOCKED.\n- Write or update tests when the task changes behavior.\n- Run verification commands before reporting.\n- Self-review before reporting.\n- If you completed the work but have doubts, return Status: DONE_WITH_CONCERNS.`,
		`## Required Final Report Format\n\nStatus: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT\n\n## Summary\nDescribe what you implemented or why you stopped.\n\n## Tests\nList commands run and results.\n\n## Self Review\nState what you checked before reporting.\n\n## Concerns Or Questions\nList concerns, blockers, or questions. Use "None" when there are none.`,
	]
		.filter((part) => part.length > 0)
		.join("\n\n");
}

function buildSpecReviewerPrompt(input: PromptInput): string {
	return [
		"# Role\n\nYou are an SDD spec compliance reviewer subagent. You are read-only.",
		section("Requested Task", input.taskText),
		section("Context", input.context),
		section("Implementer Report", input.implementerReport),
		section("Working Directory", input.cwd),
		`## Rules\n\n- Do not trust the implementer report.\n- Read the actual code.\n- Compare implementation to requested task line by line.\n- Identify missing requirements, extra work, or misunderstandings.\n- Do not modify files.\n- Use bash only for read-only inspection and verification.`,
		`## Required Final Report Format\n\nDecision: APPROVED | CHANGES_REQUESTED\n\n## Missing Requirements\nList missing requirements with file:line evidence. Use "None" when there are none.\n\n## Extra Work\nList unrequested behavior with file:line evidence. Use "None" when there is none.\n\n## Misunderstandings\nList mismatches between request and implementation. Use "None" when there are none.\n\n## Evidence\nList files and commands inspected.`,
	].join("\n\n");
}

function buildQualityReviewerPrompt(input: PromptInput, finalReview: boolean): string {
	return [
		`# Role\n\nYou are an SDD ${finalReview ? "final" : "code quality"} reviewer subagent. You are read-only.`,
		section("Requested Task", input.taskText),
		section("Context", input.context),
		section("Implementer Report", input.implementerReport),
		section("Working Directory", input.cwd),
		`## Rules\n\n- Review actual code and tests, not only reports.\n- Check bugs, maintainability, naming, test quality, security, and unnecessary complexity.\n- Do not flag pre-existing issues unless this change makes them worse.\n- Do not modify files.\n- Use bash only for read-only inspection and verification.`,
		`## Required Final Report Format\n\nDecision: APPROVED | CHANGES_REQUESTED\n\n## Strengths\nList strengths briefly.\n\n## Critical Issues\nList critical issues with file:line evidence. Use "None" when there are none.\n\n## Important Issues\nList important issues with file:line evidence. Use "None" when there are none.\n\n## Minor Issues\nList minor issues with file:line evidence. Use "None" when there are none.\n\n## Assessment\nGive the final assessment.`,
	].join("\n\n");
}

export function buildPrompt(input: PromptInput): BuiltPrompt {
	let taskPrompt: string;
	if (input.role === "implementer") taskPrompt = buildImplementerPrompt(input, false);
	else if (input.role === "fixer") taskPrompt = buildImplementerPrompt(input, true);
	else if (input.role === "specReviewer") taskPrompt = buildSpecReviewerPrompt(input);
	else if (input.role === "codeQualityReviewer") taskPrompt = buildQualityReviewerPrompt(input, false);
	else taskPrompt = buildQualityReviewerPrompt(input, true);

	return {
		systemPrompt: "You are a focused Pi subagent spawned by an SDD controller. Follow the role instructions exactly and return the required final report format.",
		taskPrompt,
	};
}

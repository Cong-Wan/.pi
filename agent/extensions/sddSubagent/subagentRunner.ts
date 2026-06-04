/*
Author: wilbur
Version: 1.0
Date: 2026-06-02
Description: Child Pi process runner for executable SDD subagent invocations.
*/

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { RoleConfig } from "./sddConfig.ts";
import { buildParsedResult, createParserState, handleJsonEvent, type ParsedSubagentResult, type ParserState } from "./resultParser.ts";

export interface RunSubagentInput {
	cwd: string;
	roleConfig: RoleConfig;
	systemPrompt: string;
	taskPrompt: string;
	signal?: AbortSignal;
	onUpdate?: (result: ParsedSubagentResult) => void;
}

export interface PiInvocation {
	command: string;
	args: string[];
}

export function buildPiArgs(input: { roleConfig: RoleConfig; systemPromptPath: string; taskPrompt: string }): string[] {
	const args = [
		"--mode",
		"json",
		"-p",
		"--no-session",
		"--no-extensions",
		"--thinking",
		input.roleConfig.thinkingLevel,
		"--tools",
		input.roleConfig.tools.join(","),
		"--append-system-prompt",
		input.systemPromptPath,
		input.taskPrompt,
	];
	if (!input.roleConfig.model) return args;
	return ["--mode", "json", "-p", "--no-session", "--no-extensions", "--model", input.roleConfig.model, ...args.slice(5)];
}

export function getPiInvocation(args: string[]): PiInvocation {
	const currentScript = process.argv[1];
	const isBunVirtualScript = currentScript?.startsWith("/$bunfs/root/") ?? false;
	if (currentScript && !isBunVirtualScript && fs.existsSync(currentScript) && path.basename(currentScript) !== "vitest.mjs") {
		return { command: process.execPath, args: [currentScript, ...args] };
	}
	const execName = path.basename(process.execPath).toLowerCase();
	const isGenericRuntime = /^(node|bun)(\.exe)?$/.test(execName);
	if (!isGenericRuntime) return { command: process.execPath, args };
	return { command: "pi", args };
}

export function processJsonLine(state: ParserState, line: string): void {
	const trimmed = line.trim();
	if (!trimmed) return;
	try {
		const event = JSON.parse(trimmed) as unknown;
		handleJsonEvent(state, event);
	} catch {
		return;
	}
}

async function writeTempPrompt(systemPrompt: string): Promise<{ dir: string; filePath: string }> {
	const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "pi-sdd-subagent-"));
	const filePath = path.join(dir, "systemPrompt.md");
	await fs.promises.writeFile(filePath, systemPrompt, { encoding: "utf8", mode: 0o600 });
	return { dir, filePath };
}

async function removeTempPrompt(dir: string, filePath: string): Promise<void> {
	try {
		await fs.promises.unlink(filePath);
	} catch {
		return;
	}
	try {
		await fs.promises.rmdir(dir);
	} catch {
		return;
	}
}

export async function runSubagent(input: RunSubagentInput): Promise<ParsedSubagentResult> {
	const promptFile = await writeTempPrompt(input.systemPrompt);
	const state = createParserState();
	let exitCode = 1;
	let wasAborted = false;
	let timeoutId: NodeJS.Timeout | undefined;

	try {
		const args = buildPiArgs({
			roleConfig: input.roleConfig,
			systemPromptPath: promptFile.filePath,
			taskPrompt: input.taskPrompt,
		});
		const invocation = getPiInvocation(args);
		exitCode = await new Promise<number>((resolve) => {
			const proc = spawn(invocation.command, invocation.args, {
				cwd: input.cwd,
				shell: false,
				stdio: ["ignore", "pipe", "pipe"],
			});
			let stdoutBuffer = "";

			const emitUpdate = () => {
				if (!input.onUpdate) return;
				input.onUpdate(buildParsedResult(input.roleConfig.role, state, -1));
			};

			proc.stdout.on("data", (chunk) => {
				stdoutBuffer += chunk.toString();
				const lines = stdoutBuffer.split("\n");
				stdoutBuffer = lines.pop() ?? "";
				for (const line of lines) processJsonLine(state, line);
				emitUpdate();
			});

			proc.stderr.on("data", (chunk) => {
				state.stderr += chunk.toString();
			});

			proc.on("close", (code) => {
				if (stdoutBuffer.trim()) processJsonLine(state, stdoutBuffer);
				resolve(code ?? 0);
			});

			proc.on("error", (error) => {
				state.stderr += error.message;
				resolve(1);
			});

			const killChild = () => {
				wasAborted = true;
				proc.kill("SIGTERM");
				setTimeout(() => {
					if (!proc.killed) proc.kill("SIGKILL");
				}, 5000);
			};

			if (input.signal) {
				if (input.signal.aborted) killChild();
				else input.signal.addEventListener("abort", killChild, { once: true });
			}

			timeoutId = setTimeout(killChild, input.roleConfig.timeoutMs);
		});
	} finally {
		if (timeoutId) clearTimeout(timeoutId);
		await removeTempPrompt(promptFile.dir, promptFile.filePath);
	}

	const result = buildParsedResult(input.roleConfig.role, state, exitCode);
	if (wasAborted && !result.stderr) result.stderr = "Subagent process was aborted.";
	return result;
}

/*
Author: wilbur
Version: 1.0
Date: 2026-06-03
Description: Case-insensitive model ID resolver. Reads ~/.pi/agent/models.json and matches user-provided model IDs against registered models, returning canonical provider/model-id format.
*/

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

interface ModelEntry {
	id: string;
	name?: string;
}

interface ProviderEntry {
	models?: ModelEntry[];
}

interface ModelsJson {
	providers?: Record<string, ProviderEntry>;
}

interface ModelInfo {
	provider: string;
	modelId: string;
	name?: string;
}

const MODELS_JSON_PATH = path.join(os.homedir(), ".pi", "agent", "models.json");

let cachedModels: ModelInfo[] | undefined;
let cachedMtime = 0;

function loadModels(): ModelInfo[] {
	if (cachedModels) {
		try {
			const stat = fs.statSync(MODELS_JSON_PATH);
			if (stat.mtimeMs === cachedMtime) return cachedModels;
		} catch {
			return cachedModels;
		}
	}

	try {
		const raw = fs.readFileSync(MODELS_JSON_PATH, "utf8");
		const data: ModelsJson = JSON.parse(raw);
		const models: ModelInfo[] = [];
		for (const [providerName, provider] of Object.entries(data.providers ?? {})) {
			for (const model of provider.models ?? []) {
				models.push({
					provider: providerName,
					modelId: model.id,
					name: model.name,
				});
			}
		}
		cachedModels = models;
		try {
			cachedMtime = fs.statSync(MODELS_JSON_PATH).mtimeMs;
		} catch {
			// ignore
		}
		return models;
	} catch {
		return cachedModels ?? [];
	}
}

export function resolveModelId(input: string): string {
	if (!input || !input.trim()) return input;

	const trimmed = input.trim();
	const models = loadModels();
	if (models.length === 0) return trimmed;

	const inputLower = trimmed.toLowerCase();

	// 1. Exact provider/model-id match (case-insensitive)
	for (const m of models) {
		const fullId = `${m.provider}/${m.modelId}`;
		if (fullId.toLowerCase() === inputLower) return fullId;
	}

	// 2. Exact model-id-only match (case-insensitive)
	for (const m of models) {
		if (m.modelId.toLowerCase() === inputLower) return `${m.provider}/${m.modelId}`;
	}

	// 3. Display name match (case-insensitive)
	for (const m of models) {
		if (m.name && m.name.toLowerCase() === inputLower) return `${m.provider}/${m.modelId}`;
	}

	// 4. Partial/fuzzy: input is a substring of model-id (case-insensitive)
	const partialMatches: ModelInfo[] = [];
	for (const m of models) {
		if (m.modelId.toLowerCase().includes(inputLower) || inputLower.includes(m.modelId.toLowerCase())) {
			partialMatches.push(m);
		}
	}
	if (partialMatches.length === 1) return `${partialMatches[0]!.provider}/${partialMatches[0]!.modelId}`;

	// 5. Partial/fuzzy on display name
	const nameMatches: ModelInfo[] = [];
	for (const m of models) {
		if (m.name && (m.name.toLowerCase().includes(inputLower) || inputLower.includes(m.name.toLowerCase()))) {
			nameMatches.push(m);
		}
	}
	if (nameMatches.length === 1) return `${nameMatches[0]!.provider}/${nameMatches[0]!.modelId}`;

	// No match: return as-is, let pi handle it
	return trimmed;
}

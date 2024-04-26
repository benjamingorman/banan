import type { Mark } from "flame-chart-js";

/**
 * The response from the /api/history endpoint.
 */
export interface ApiHistoryResponse {
	error?: string;
	history?: ProfilingNode[];
}

/**
 * A node in the format that banan creates.
 */
export interface ProfilingNode {
	key: string;
	start: number;
	cpu: number;
	children: ProfilingNode[];
	marks?: Mark[];
	intents?: number;
}

export type ProfilingSummary = ProfilingSummaryItem[];

export interface ProfilingSummaryItem {
	key: string;
	total: number;
	count: number;
	percent: number;
}

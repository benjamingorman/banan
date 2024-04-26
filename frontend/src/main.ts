import "./style.scss";
import type {
	ApiHistoryResponse,
	ProfilingNode,
	ProfilingSummary,
} from "./types";

import { colorByTotalDuration } from "./colors";
import { renderFlameGraph } from "./flamegraph";

type GraphDisplayMode = "single-tick-call-tree" | "single-tick-totals";

class AppEvents {
	private static currentHistory: ProfilingNode[] | undefined;
	private static graphDisplayMode: GraphDisplayMode = "single-tick-call-tree";
	private static selectedTick: string | undefined;

	/**
	 * Called when the page first loads.
	 */
	static onPageLoad() {
		refreshHistoryData();
	}

	/**
	 * Called after we fetch profiling history from the API.
	 */
	static onFetchHistory(resp: ApiHistoryResponse) {
		AppEvents.setAvailableTicks(resp);

		AppEvents.currentHistory = resp.history;

		// Load the most recent tick we have data for by default
		// const node = AppEvents.getNodeForMostRecentTick();
		// if (!node) {
		// 	setError("No node found in response");
		// 	return;
		// }

		// AppEvents.onSetCurrentNode(node);
		AppEvents.onSetGraphDisplayMode("single-tick-call-tree");
	}

	/**
	 * Called after we fail to fetch profiling history from the API.
	 */
	static onFetchHistoryError(error: string) {
		setError(error);
	}

	/**
	 * Set the display mode for the graph.
	 */
	static onSetGraphDisplayMode(mode: GraphDisplayMode) {
		console.log("mode", mode);
		AppEvents.graphDisplayMode = mode;

		switch (mode) {
			case "single-tick-totals": {
				break;
			}

			case "single-tick-call-tree": {
				break;
			}

			default:
				throw new Error(`Unhandled display mode: ${mode}`);
		}

		let selectedTick = AppEvents.selectedTick;
		if (!selectedTick && AppEvents.currentHistory?.length) {
			selectedTick =
				AppEvents.currentHistory[AppEvents.currentHistory.length - 1].key;
		}

		if (selectedTick) AppEvents.onSetSelectedTick(selectedTick);
	}

	/**
	 * Set the node to display in the graph.
	 */
	static onSetCurrentNode(node: ProfilingNode) {
		console.log("onSetCurrentNode", node);
		renderFlameGraph(node);
		renderSummary(node);
	}

	/**
	 * Set the selected tick to display.
	 */
	static onSetSelectedTick(tick: string) {
		AppEvents.selectedTick = tick;

		let node;
		switch (AppEvents.graphDisplayMode) {
			case "single-tick-call-tree":
				node = AppEvents.getNodeForTick(tick);
				break;

			case "single-tick-totals": {
				const tickNode = AppEvents.getNodeForTick(tick);
				if (tickNode) {
					node = computeTotalsNode(tickNode);
				}
				break;
			}
		}

		if (!node) {
			console.error("No node for tick", tick, AppEvents.currentHistory);
			return;
		}

		AppEvents.onSetCurrentNode(node);
	}

	/**
	 * When the user clicks the refresh button.
	 */
	static onPressRefreshBtn() {
		refreshHistoryData();
	}

	/**
	 * Update the available ticks dropdown.
	 */
	private static setAvailableTicks(resp: ApiHistoryResponse) {
		const availableTicksElem = document.getElementById("availableTicks")!;
		availableTicksElem.innerHTML = "";
		AppEvents.currentHistory = resp.history;
		for (const dump of resp.history || []) {
			availableTicksElem.innerHTML += `<option value="${dump.key}">${dump.key}</option>`;
		}
	}

	/**
	 * Try and get the node for the given tick from the current history.
	 */
	private static getNodeForTick(key: string): ProfilingNode | undefined {
		for (const node of AppEvents.currentHistory || []) {
			if (node.key === key) {
				return node;
			}
		}
		return undefined;
	}

	private static getNodeForMostRecentTick(): ProfilingNode | undefined {
		return AppEvents.currentHistory?.[AppEvents.currentHistory.length - 1];
	}
}

/**
 * Compute an node which shows the average of all of the calls in each
 * history node.
 */
const computeTotalsNode = (rootNode: ProfilingNode): ProfilingNode => {
	interface TotalsNode {
		key: string;
		count: number;
		totalCpu: number;
		totalStart: number;
		childrenMap: Map<string, TotalsNode>;
	}

	const computeTotals = (
		node: ProfilingNode,
		isRootNode: boolean,
		parentChildrenMap: Map<string, TotalsNode>,
	): TotalsNode => {
		// const key = isRootNode ? "Averaged" : node.key;
		// const keys = [...(parentKeys || []), key];
		// const mapKey = keys.join(",");
		const key = node.key;

		console.log("Computing", node.key, key);

		let totalsNode = parentChildrenMap.get(key);
		if (!totalsNode) {
			totalsNode = {
				key: key,
				count: 1,
				totalCpu: node.cpu,
				totalStart: node.start,
				childrenMap: new Map<string, TotalsNode>(),
			};
			parentChildrenMap.set(key, totalsNode);
		} else {
			totalsNode.count += 1;
			totalsNode.totalCpu += node.cpu;
			totalsNode.totalStart += node.start;
		}

		for (const child of node.children) {
			const childTotalsNode = computeTotals(
				child,
				false,
				totalsNode.childrenMap,
			);

			if (!totalsNode.childrenMap.has(childTotalsNode.key)) {
				totalsNode.childrenMap.set(childTotalsNode.key, childTotalsNode);
			}
		}

		return totalsNode;
	};

	const rootChildrenMap = new Map<string, TotalsNode>();
	computeTotals(rootNode, true, rootChildrenMap);

	const totalsRoot = rootChildrenMap.get(rootNode.key)!;

	console.log("totalsRoot", totalsRoot);

	const convert = (
		totalsNode: TotalsNode,
		thisStart: number,
		parentCpu?: number,
		siblingsCpuSum?: number,
	): ProfilingNode => {
		console.log("Convert", totalsNode.key, thisStart);

		let thisCpu = totalsNode.totalCpu;

		if (parentCpu) {
			// For children their cpu is a fraction of the parent
			thisCpu = Math.min((thisCpu / siblingsCpuSum!) * parentCpu, thisCpu);
		}

		// const thisEnd = thisStart + thisCpu;

		// If we keep the original averaged start times on the graph it won't make
		// much sense since lots of things will be overlapping.
		// Instead let's set the start time to a proportional value of the parent
		// node's duration.
		// The children can still be sorted by average start time though.

		const children = Array.from(totalsNode.childrenMap.values()).sort(
			(child) => child.totalStart / child.count,
		);
		const childrenCpuSum = children.reduce(
			(sum, child) => sum + child.totalCpu,
			0,
		);

		const convertedChildren = [];
		let lastEnd = thisStart;

		for (const child of children) {
			const childCpu = (child.totalCpu / childrenCpuSum) * thisCpu;
			convertedChildren.push(convert(child, lastEnd, thisCpu, childrenCpuSum));
			lastEnd += childCpu;
		}

		return {
			key: totalsNode.key,
			cpu: thisCpu,
			start: thisStart,
			children: convertedChildren,
		};
	};

	const convertedTree = convert(totalsRoot, 0);
	console.log(convertedTree);
	return convertedTree;
};

/**
 * Compute a table style summary of the given profiling tree.
 */
const computeSummary = (bananNode: ProfilingNode): ProfilingSummary => {
	const tickTotal = bananNode.cpu;
	const totals = new Map<string, number>();
	const counts = new Map<string, number>();

	const getTotals = (node: ProfilingNode) => {
		const existingTotal = totals.get(node.key) || 0;
		totals.set(node.key, existingTotal + node.cpu);

		const existingCount = counts.get(node.key) || 0;
		counts.set(node.key, existingCount + 1);

		for (const child of node.children) {
			getTotals(child);
		}
	};

	getTotals(bananNode);

	const result: ProfilingSummary = [];
	for (const [key, total] of totals) {
		const count = counts.get(key)!;
		result.push({ key, total, count, percent: (total / tickTotal) * 100 });
	}
	result.sort((a, b) => b.total - a.total);
	return result;
};

/**
 * Set an error message to be displayed in the UI.
 */
const setError = (error: string) => {
	document.getElementById("details")!.innerHTML = error;
};

const renderSummary = (node: ProfilingNode) => {
	const summary = computeSummary(node);
	console.log("summary", summary);
	const summaryElem = document.getElementById("summary-table")!;

	summaryElem.innerHTML =
		"<tr><th>Key</th><th>Total</th><th>Percent</th><th>Count</th><th>Mean</th></tr>";

	for (const item of summary) {
		const row = document.createElement("tr");
		row.style.setProperty("color", colorByTotalDuration(item.total));
		const keyParts = item.key.split(":");
		let keySpans = [];

		for (let i = 0; i < keyParts.length; i++) {
			const part = keyParts[i];
			if (i === 0) {
				keySpans.push(`<span class="key-class">${part}</span>`);
			} else {
				keySpans.push(`<span class="key-method">:${part}</span>`);
			}
		}

		if (item.key.length <= 14) {
			// No need for breaks
			keySpans = [keySpans.join("")];
		}

		const items: string[] = [
			`<td>${keySpans.join("<br>")}</td>`,
			`<td>${item.total.toFixed(2)}</td>`,
			`<td>${item.percent.toFixed(1)}%</td>`,
			`<td>${item.count}</td>`,
			`<td>${(item.total / item.count).toFixed(2)}</td>`,
		];
		row.innerHTML = items.join("");
		summaryElem.appendChild(row);
	}
};

const refreshHistoryData = () => {
	console.log("Refreshing graph");

	fetch("/api/history/pserver")
		.then((response) => response.json())
		.then((data) => {
			console.log("history", data);
			const apiResp = data as ApiHistoryResponse;

			if (apiResp.error) {
				AppEvents.onFetchHistoryError(apiResp.error);
				return;
			}

			AppEvents.onFetchHistory(data);
		});
};

window.addEventListener("load", () => {
	AppEvents.onPageLoad();
});

document.getElementById("refresh-btn")?.addEventListener("click", () => {
	AppEvents.onPressRefreshBtn();
});

document
	.getElementById("availableTicks")
	?.addEventListener("change", (event) => {
		AppEvents.onSetSelectedTick((event.target as HTMLSelectElement).value);
	});

const graphModeRadios = document.querySelectorAll("input[name='graph-mode']");

for (const radio of graphModeRadios) {
	radio.addEventListener("change", (event) => {
		const val = (event.target as HTMLInputElement).value as GraphDisplayMode;
		AppEvents.onSetGraphDisplayMode(val);
	});
}

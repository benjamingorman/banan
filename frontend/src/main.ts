import { FlameChart, type FlameChartNode, type Mark } from "flame-chart-js";
import "./style.scss";

enum ScreepsColors {
	Background = "#1C1C1C",
	Map = "#2B2B2B",
	Lab = "#3B3B3B",
	Energy = "#FDDC6A",
	MapArrow = "#494949",
	RampartMiddle = "#354C35",
	RampartEdge = "#438843",
	ControllerDark = "#5654D9",
	ControllerLight = "#9997FA",
}

// https://coolors.co/gradient-palette/494949-ffffff?number=7
const BAR_COLOR_GRADIENT = [
	ScreepsColors.Map,
	ScreepsColors.Lab,
	ScreepsColors.MapArrow,
	ScreepsColors.RampartMiddle,
	ScreepsColors.RampartEdge,
	"#51b051",
	"#5bc75b",
	ScreepsColors.ControllerDark,
	ScreepsColors.ControllerLight,
	"#FF00FF",
	"#39FF14",
	"#40E0D0",
	"#FFD700",
].map((color) => `${color}`);

const COLOR_LEVELS: [number, string][] = [
	[0, BAR_COLOR_GRADIENT[0]],
	[1, BAR_COLOR_GRADIENT[1]],
	[2, BAR_COLOR_GRADIENT[2]],
	[3, BAR_COLOR_GRADIENT[3]],
	[4, BAR_COLOR_GRADIENT[4]],
	[5, BAR_COLOR_GRADIENT[5]],
	[6, BAR_COLOR_GRADIENT[6]],
	[7, BAR_COLOR_GRADIENT[7]],
	[8, BAR_COLOR_GRADIENT[8]],
	[9, BAR_COLOR_GRADIENT[9]],
];

const DEFAULT_NODE_COLOR = ScreepsColors.MapArrow;
const DEFAULT_MARK_COLOR = ScreepsColors.Energy;

interface ApiHistoryResponse {
	error?: string;
	history?: ProfilingNode[];
}

/**
 * A node in the format that banan creates.
 */
interface ProfilingNode {
	key: string;
	start: number;
	cpu: number;
	children: ProfilingNode[];
	marks?: Mark[];
}

type ProfilingSummary = ProfilingSummaryItem[];

interface ProfilingSummaryItem {
	key: string;
	total: number;
	count: number;
	percent: number;
}

const getNodeColor = (depth: number, duration: number): string => {
	const [_, color] = COLOR_LEVELS[Math.min(depth, COLOR_LEVELS.length - 1)];
	return color;
};

const bananNodeToFlameChartNode = (
	bananNode: ProfilingNode,
	depth = 0,
): FlameChartNode => {
	return {
		name: bananNode.key,
		start: bananNode.start,
		duration: bananNode.cpu,
		color: getNodeColor(depth, bananNode.cpu),
		// value: Math.round(bananNode.cpu * 1000) / 1000,
		children: bananNode.children.map((node) =>
			bananNodeToFlameChartNode(node, depth + 1),
		),
	};
};

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

const setError = (error: string) => {
	document.getElementById("details")!.innerHTML = error;
};

let currentHistory: ProfilingNode[] | undefined;

const getNodeForTick = (key: string): ProfilingNode | undefined => {
	for (const node of currentHistory || []) {
		if (node.key === key) {
			return node;
		}
	}
	return undefined;
};

const changeTick = (key: string) => {
	const node = getNodeForTick(key);
	if (!node) {
		console.error("No node for tick", key, currentHistory);
		return;
	}

	renderFlameGraph(node);
};

const renderSummary = (node: ProfilingNode) => {
	const summary = computeSummary(node);
	console.log("summary", summary);
	const summaryElem = document.getElementById("summary-table")!;

	summaryElem.innerHTML =
		"<tr><th>Key</th><th>Total</th><th>Percent</th><th>Count</th><th>Mean</th></tr>";

	for (const item of summary) {
		const row = document.createElement("tr");
		const items: string[] = [
			`<td>${item.key}</td>`,
			`<td>${item.total.toFixed(2)}</td>`,
			`<td>${item.percent.toFixed(1)}%</td>`,
			`<td>${item.count}</td>`,
			`<td>${(item.total / item.count).toFixed(2)}</td>`,
		];
		row.innerHTML = items.join("");
		summaryElem.appendChild(row);
	}
};

const renderFlameGraph = (node: ProfilingNode) => {
	const canvas = document.getElementById("canvas") as HTMLCanvasElement;
	const nodes = [bananNodeToFlameChartNode(node)];

	canvas.width = window.innerWidth * 1;
	canvas.height = window.innerHeight * 0.8;

	// TODO handle resize
	// const observer = new ResizeObserver((entries) => {
	// 	canvas.width = canvas.clientWidth;
	// 	canvas.height = canvas.clientHeight;
	// });
	// observer.observe(canvas);

	// export type RenderStyles = {
	//     blockHeight: number;
	//     blockPaddingLeftRight: number;
	//     backgroundColor: string;
	//     font: string;
	//     fontColor: string;
	//     badgeSize: number;
	//     tooltipHeaderFontColor: string;
	//     tooltipBodyFontColor: string;
	//     tooltipBackgroundColor: string;
	//     tooltipShadowColor: string;
	//     tooltipShadowBlur: number;
	//     tooltipShadowOffsetX: number;
	//     tooltipShadowOffsetY: number;
	//     headerHeight: number;
	//     headerColor: string;
	//     headerStrokeColor: string;
	//     headerTitleLeftPadding: number;
	// };

	const flameChart = new FlameChart({
		canvas, // mandatory
		data: nodes,
		colors: {
			task: "#FFFFFF",
			"sub-task": "#000000",
		},
		marks: (node.marks || []).map((mark) => ({
			...mark,
			color: DEFAULT_MARK_COLOR,
		})),
		settings: {
			// hotkeys: {
			//   active: true,  // enable navigation using arrow keys
			//   scrollSpeed: 0.5, // scroll speed (ArrowLeft, ArrowRight)
			//   zoomSpeed: 0.001, // zoom speed (ArrowUp, ArrowDown, -, +)
			//   fastMultiplayer: 5, // speed multiplier when zooming and scrolling (activated by Shift key)
			// },
			options: {
				// tooltip: true
				tooltip: (data, renderEngine, mouse) => {
					if (!data?.data?.source) {
						return;
					}
					const node = data.data.source;

					document.getElementById("details-data")!.innerHTML = `
           <p>
            Name: ${node.name}<br>
            Start: ${node.start.toFixed(3)}<br>
            Duration: ${node.duration.toFixed(3)}<br>
           </p>
          `;
				},
				timeUnits: "ms",
			},
			styles: {
				timeGrid: {
					// color: "#202020",
				},
				main: {
					blockHeight: 40,
					// Use screeps style colors
					backgroundColor: ScreepsColors.Background,
					fontColor: ScreepsColors.Energy,
				},
			},
		},
	});

	console.log("Created flamegraph");
	flameChart.setNodes(nodes);
	console.log("nodes", nodes);
	renderSummary(node);
};

const refreshGraph = () => {
	console.log("Refreshing graph");

	fetch("/api/history/pserver")
		.then((response) => response.json())
		.then((data) => {
			console.log(data);
			const apiResp = data as ApiHistoryResponse;

			if (apiResp.error) {
				setError(apiResp.error);
				return;
			}

			const availableTicksElem = document.getElementById("availableTicks")!;
			availableTicksElem.innerHTML = "";
			currentHistory = apiResp.history;
			for (const dump of apiResp.history || []) {
				availableTicksElem.innerHTML += `<option value="${dump.key}">${dump.key}</option>`;
			}

			// Load the most recent tick we have data for by default
			const dump = apiResp.history?.[apiResp.history.length - 1];
			if (!dump) {
				setError("No dump found in response");
				return;
			}

			renderFlameGraph(dump);
		});
};

refreshGraph();
document.getElementById("load")!.onclick = () => {
	refreshGraph();
};

document.getElementById("availableTicks")!.onchange = (event) => {
	changeTick((event.target as HTMLSelectElement).value);
};

// setInterval(() => {
// 	refreshGraph();
// }, 10000);

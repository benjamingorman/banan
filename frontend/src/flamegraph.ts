import { FlameChart, type FlameChartNode } from "flame-chart-js";
import { DEFAULT_MARK_COLOR, ScreepsColors, getNodeColor } from "./colors";
import type { ProfilingNode } from "./types";

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

export const renderFlameGraph = (node: ProfilingNode) => {
	const chart = document.getElementById("chart") as HTMLDivElement;
	chart.innerHTML = "";

	const canvas = document.createElement("canvas") as HTMLCanvasElement;
	chart.appendChild(canvas);

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
				// tooltip: (data, renderEngine, mouse) => {
				// 	if (!data?.data?.source) {
				// 		return;
				// 	}
				// 	const node = data.data.source;

				// 	document.getElementById("details-data")!.innerHTML = `
				// <p>
				// Name: ${node.name}<br>
				// Start: ${node.start.toFixed(3)}<br>
				// Duration: ${node.duration.toFixed(3)}<br>
				// </p>
				// `;
				// },
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
};

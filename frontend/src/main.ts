import * as d3 from "d3";
import { flamegraph } from "d3-flame-graph";
import "d3-tip";
import "./style.css";

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
}

/**
 * A node in the format that the flamegraph library expects.
 */
interface FlamegraphNode {
	name: string;
	value: number;
	children: FlamegraphNode[];
}

const bananNodeToFlamegraphNode = (
	bananNode: ProfilingNode,
): FlamegraphNode => {
	return {
		name: bananNode.key,
		value: Math.round(bananNode.cpu * 1000) / 1000,
		children: bananNode.children.map(bananNodeToFlamegraphNode),
	};
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

const renderFlameGraph = (node: ProfilingNode) => {
	const flameGraph = flamegraph()
		.width(960)
		.cellHeight(18)
		.transitionDuration(750)
		.minFrameSize(5)
		.sort(true)
		.title("banan")
		.selfValue(false)
		.setColorMapper((d: any, originalColor: any) =>
			d.highlight ? "#6aff8f" : originalColor,
		);

	flameGraph.setDetailsElement(document.getElementById("details"));

	//Example to sort in reverse order
	//.sort(function(a,b){ return d3.descending(a.name, b.name);})
	// .transitionEase(d3.easeCubic);
	// .onClick(onClick)

	console.log("Created flamegraph");

	const fgNode = bananNodeToFlamegraphNode(node);
	console.log("fgNode", fgNode);
	d3.select("#chart").datum(fgNode).call(flameGraph);
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

			const dump = apiResp.history?.[0];
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

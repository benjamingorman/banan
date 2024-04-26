export enum ScreepsColors {
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
export const BAR_COLOR_GRADIENT = [
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

export const COLOR_LEVELS: [number, string][] = [
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

export const DEFAULT_MARK_COLOR = ScreepsColors.Energy;

export const getNodeColor = (depth: number, duration: number): string => {
	const [_, color] = COLOR_LEVELS[Math.min(depth, COLOR_LEVELS.length - 1)];
	return color;
};

export const colorByTotalDuration = (duration: number): string => {
	if (duration > 10) {
		return "red";
	}
	if (duration > 5) {
		return "orange";
	}
	if (duration > 1) {
		return "yellow";
	}
	if (duration > 0.2) {
		return "lightgreen";
	}
	return "white";
};

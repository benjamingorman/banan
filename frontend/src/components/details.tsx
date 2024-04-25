import { For, batch, createSignal } from "solid-js";
import { render } from "solid-js/web";

interface NodeInfo {
	name: string;
	start: number;
	duration: number;
}

const Details = () => {
	const [nodeInfo, setNodeInfo] = createSignal<NodeInfo | undefined>(undefined);

	if (!nodeInfo()) {
		return <p />;
	}

	return (
		<p>
			Name: ${nodeInfo()?.name}
			<br />
			Start: ${nodeInfo()?.start.toFixed(3)}
			<br />
			Duration: ${nodeInfo()?.duration.toFixed(3)}
			<br />
		</p>
	);
};

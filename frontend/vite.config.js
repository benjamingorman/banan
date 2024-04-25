import { defineConfig, loadEnv } from "vite";

export default ({ mode }) => {
	process.env = { ...process.env, ...loadEnv(mode, process.cwd()) };

	const vite_docker = process.env.VITE_DOCKER ? true : false;
	const vite_host = process.env.VITE_HOST ?? "localhost";
	const vite_backend_host = process.env.VITE_BACKEND_HOST ?? "localhost";

	console.log("Vite host:", vite_host);
	console.log("Vite docker:", vite_docker);
	console.log("Backend host:", vite_backend_host);

	return defineConfig({
		server: {
			host: vite_host,
			port: 8080,
			watch: {
				// Hot reload doesn't seem to work inside Docker
				// unless polling is enabled.
				usePolling: vite_docker,
			},
			proxy: {
				"/api": {
					target: `http://${vite_backend_host}:8081`,
					changeOrigin: false,
					secure: false,
				},
			},
		},
	});
};

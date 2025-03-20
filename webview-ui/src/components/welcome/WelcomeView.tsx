import { VSCodeButton } from "@vscode/webview-ui-toolkit/react"
import { useState } from "react"
// import { useExtensionState } from "../../context/ExtensionStateContext"
// import { validateApiConfiguration } from "../../utils/validate"
import { vscode } from "../../utils/vscode"
// import ApiOptions from "../settings/ApiOptions"
import { VSCodeTextField } from "@vscode/webview-ui-toolkit/react"

const WelcomeView = () => {
	// const { baseApi, reportApi, setBaseApi, setReportApi } = useExtensionState()
	const [apiKey, setApiKey] = useState("")
	const [baseApi, setBaseApi] = useState("http://22.189.54.139/aicoding")
	const [reportApi, setReportApi] = useState("http://22.189.54.139/report")

	const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined)

	const handleSubmit = () => {
		// const error = validateApiConfiguration(apiConfiguration)
		// if (error) {
		// 	setErrorMessage(error)
		// 	return
		// }
		setErrorMessage(undefined)
		// vscode.postMessage({ type: "apiConfiguration", apiConfiguration })
		const initConfig = { baseApi, reportApi, apiKey }
		vscode.postMessage({ type: "initConfig", initConfig })
		// vscode.postMessage({ type: "webviewDidLaunch" })
		// vscode.postMessage({ type: "loadApiConfiguration", text: 'qwen' })
	}

	return (
		<div className="flex flex-col min-h-screen px-0 pb-5">
			<h2>你好，我是 AIxCoding!</h2>
			{/* <p>
				我可以完成各种任务，这要归功于代理编码能力的最新突破以及访问各种工具的能力，这些工具使我能够创建和编辑文件、浏览复杂的项目、使用浏览器和执行终端命令（当然，需要您的许可）。
			</p> */}

			<b>要开始使用，请配置以下参数。</b>

			<div className="mt-3 flex flex-col gap-y-3">
				{/* <ApiOptions fromWelcomeView /> */}
				<VSCodeTextField
					value={baseApi}
					style={{ width: "100%" }}
					type="url"
					onChange={(e: any) => setBaseApi(e.target.value)}
					placeholder={"请输入基础 URL..."}>
					<span style={{ fontWeight: 500 }}>基础 URL</span>
				</VSCodeTextField>
				<VSCodeTextField
					value={apiKey}
					style={{ width: "100%" }}
					type="password"
					onChange={(e: any) => setApiKey(e.target.value)}
					placeholder="请输入 API 密钥...">
					<span style={{ fontWeight: 500 }}>API 密钥</span>
				</VSCodeTextField>
				<VSCodeTextField
					value={reportApi}
					style={{ width: "100%" }}
					type="url"
					onChange={(e: any) => setReportApi(e.target.value)}
					placeholder="请输入获取扫描报告的 URL...">
					<span style={{ fontWeight: 500 }}>获取扫描报告的 URL</span>
				</VSCodeTextField>
			</div>

			<div className="sticky bottom-0 bg-[var(--vscode-editor-background)] py-3 mt-3">
				<div className="flex flex-col gap-1.5">
					<VSCodeButton onClick={handleSubmit}>开始吧！</VSCodeButton>
					{errorMessage && <span className="text-destructive">{errorMessage}</span>}
				</div>
			</div>
		</div>
	)
}

export default WelcomeView

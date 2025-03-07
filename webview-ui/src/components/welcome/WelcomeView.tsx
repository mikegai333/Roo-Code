import { VSCodeButton } from "@vscode/webview-ui-toolkit/react"
import { useState } from "react"
import { useExtensionState } from "../../context/ExtensionStateContext"
import { validateApiConfiguration } from "../../utils/validate"
import { vscode } from "../../utils/vscode"
import ApiOptions from "../settings/ApiOptions"

const WelcomeView = () => {
	const { apiConfiguration } = useExtensionState()

	const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined)

	const handleSubmit = () => {
		const error = validateApiConfiguration(apiConfiguration)
		if (error) {
			setErrorMessage(error)
			return
		}
		setErrorMessage(undefined)
		vscode.postMessage({ type: "apiConfiguration", apiConfiguration })
	}

	return (
		<div className="flex flex-col min-h-screen px-0 pb-5">
			<h2>你好，我是 AIxCoding!</h2>
			<p>
				我可以完成各种任务，这要归功于代理编码能力的最新突破以及访问各种工具的能力，这些工具使我能够创建和编辑文件、浏览复杂的项目、使用浏览器和执行终端命令（当然，需要您的许可）。
			</p>

			<b>要开始使用，此扩展程序需要一个 API 提供程序。</b>

			<div className="mt-3">
				<ApiOptions fromWelcomeView />
			</div>

			<div className="sticky bottom-0 bg-[var(--vscode-editor-background)] py-3">
				<div className="flex flex-col gap-1.5">
					<VSCodeButton onClick={handleSubmit}>开始吧！</VSCodeButton>
					{errorMessage && <span className="text-destructive">{errorMessage}</span>}
				</div>
			</div>
		</div>
	)
}

export default WelcomeView

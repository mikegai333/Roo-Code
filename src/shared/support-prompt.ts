// Support prompts
type PromptParams = Record<string, string | any[]>

const generateDiagnosticText = (diagnostics?: any[]) => {
	if (!diagnostics?.length) return ""
	return `\nCurrent problems detected:\n${diagnostics
		.map((d) => `- [${d.source || "Error"}] ${d.message}${d.code ? ` (${d.code})` : ""}`)
		.join("\n")}`
}

export const createPrompt = (template: string, params: PromptParams): string => {
	let result = template
	for (const [key, value] of Object.entries(params)) {
		if (key === "diagnostics") {
			result = result.replaceAll("${diagnosticText}", generateDiagnosticText(value as any[]))
		} else {
			result = result.replaceAll(`\${${key}}`, value as string)
		}
	}

	// Replace any remaining placeholders with empty strings
	result = result.replaceAll(/\${[^}]*}/g, "")

	return result
}

interface SupportPromptConfig {
	label: string
	description: string
	template: string
}

const supportPromptConfigs: Record<string, SupportPromptConfig> = {
	// 	ENHANCE: {
	// 		label: "增强提示",
	// 		description:
	// 			"使用提示增强功能来获取针对您的输入的量身定制的建议或改进。这确保AIxCoding了解您的意图并提供尽可能最佳的响应。可通过聊天中的 ✨ 图标使用。",
	// 		template: `Generate an enhanced version of this prompt (reply with only the enhanced prompt - no conversation, explanations, lead-in, bullet points, placeholders, or surrounding quotes):

	// \${userInput}`,
	// 	},
	EXPLAIN: {
		label: "解释代码",
		description:
			"获取代码片段、函数或整个文件的详细解释。有助于理解复杂的代码或学习新的模式。可在代码操作（编辑器中的灯泡图标）和编辑器上下文菜单（右键单击选定的代码）中使用。",
		template: `请解释文件 @/\${filePath}中的以下代码:
\${userInput}

\`\`\`
\${selectedText}
\`\`\`

Please provide a clear and concise explanation of what this code does, including:
1. The purpose and functionality
2. Key components and their interactions
3. Important patterns or techniques used`,
	},
	FIX: {
		label: "修复问题",
		description:
			"获取有关识别和解决错误、错误或代码质量问题的帮助。提供修复问题的分步指南。可在代码操作（编辑器中的灯泡图标）和编辑器上下文菜单（右键单击选定的代码）中使用。",
		template: `Fix any issues in the following code from file path @/\${filePath}
\${diagnosticText}
\${userInput}

\`\`\`
\${selectedText}
\`\`\`

Please:
1. Address all detected problems listed above (if any)
2. Identify any other potential bugs or issues
3. Provide corrected code
4. Explain what was fixed and why`,
	},
	IMPROVE: {
		label: "改进代码",
		description:
			"接收有关代码优化、更佳实践和架构改进的建议，同时保持功能。可在代码操作（编辑器中的灯泡图标）和编辑器上下文菜单（右键单击选定的代码）中使用。",
		template: `Improve the following code from file path @/\${filePath}:
\${userInput}

\`\`\`
\${selectedText}
\`\`\`

Please suggest improvements for:
1. Code readability and maintainability
2. Performance optimization
3. Best practices and patterns
4. Error handling and edge cases

Provide the improved code along with explanations for each enhancement.`,
	},
	ADD_TO_CONTEXT: {
		label: "添加到上下文",
		description:
			"将上下文添加到您当前的任务或对话中。有助于提供其他信息或说明。可在代码操作（编辑器中的灯泡图标）和编辑器上下文菜单（右键单击选定的代码）中使用。",
		template: `@/\${filePath}:
\`\`\`
\${selectedText}
\`\`\``,
	},
	TERMINAL_ADD_TO_CONTEXT: {
		label: "将终端内容添加到上下文",
		description:
			"将终端输出添加到您当前的任务或对话中。有助于提供命令输出或日志。可在终端上下文菜单（右键单击选定的终端内容）中使用。",
		template: `\${userInput}
Terminal output:
\`\`\`
\${terminalContent}
\`\`\``,
	},
	TERMINAL_FIX: {
		label: "修复终端命令",
		description: "获取有关修复失败或需要改进的终端命令的帮助。可在终端上下文菜单（右键单击选定的终端内容）中使用。",
		template: `\${userInput}
Fix this terminal command:
\`\`\`
\${terminalContent}
\`\`\`

Please:
1. Identify any issues in the command
2. Provide the corrected command
3. Explain what was fixed and why`,
	},
	TERMINAL_EXPLAIN: {
		label: "解释终端命令",
		description: "获取有关终端命令及其输出的详细解释。可在终端上下文菜单（右键单击选定的终端内容）中使用。",
		template: `\${userInput}
Explain this terminal command:
\`\`\`
\${terminalContent}
\`\`\`

Please provide:
1. What the command does
2. Explanation of each part/flag
3. Expected output and behavior`,
	},

	CHECK: {
		label: "检查代码",
		description: "允许您选中代码后，让 AIxCoding 针对此代码查找问题。",
		template: `检查以下文件 @/\${filePath}中的代码:
\${userInput}

\`\`\`
\${selectedText}
\`\`\`

对以上代码的风格、缺陷、安全隐患、逻辑进行复查，提供改进意见，并给出改进后的代码：`,
	},

	COMMENTS: {
		label: "生成注释",
		description: "允许您选中代码后，让 AIxCoding 针对此代码添加注释。",
		template: `请为文件@/\${filePath}中的代码添加注释，代码如下:
\${userInput}

\`\`\`
\${selectedText}
\`\`\`

`,
	},

	TEST: {
		label: "编写测试",
		description: "允许您选中代码后，让 AIxCoding 针对此代码提供测试案例。",
		template: `请为文件 @/\${filePath}中的代码生成测试案例，代码如下:
\${userInput}

\`\`\`
\${selectedText}
\`\`\`

对以上代码的风格、缺陷、安全隐患、逻辑进行复查，提供改进意见，并给出改进后的代码：`,
	},
} as const

type SupportPromptType = keyof typeof supportPromptConfigs

export const supportPrompt = {
	default: Object.fromEntries(Object.entries(supportPromptConfigs).map(([key, config]) => [key, config.template])),
	get: (customSupportPrompts: Record<string, any> | undefined, type: SupportPromptType): string => {
		return customSupportPrompts?.[type] ?? supportPromptConfigs[type].template
	},
	create: (type: SupportPromptType, params: PromptParams, customSupportPrompts?: Record<string, any>): string => {
		const template = supportPrompt.get(customSupportPrompts, type)
		return createPrompt(template, params)
	},
} as const

export type { SupportPromptType }

// Expose labels and descriptions for UI
export const supportPromptLabels = Object.fromEntries(
	Object.entries(supportPromptConfigs).map(([key, config]) => [key, config.label]),
) as Record<SupportPromptType, string>

export const supportPromptDescriptions = Object.fromEntries(
	Object.entries(supportPromptConfigs).map(([key, config]) => [key, config.description]),
) as Record<SupportPromptType, string>

export type CustomSupportPrompts = {
	[key: string]: string | undefined
}

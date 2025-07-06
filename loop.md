

这个工作流的核心是 `initiateTaskLoop` 和 `recursivelyMakeClineRequests` 这两个函数。它们共同构成了一个循环，使得 AI 能够持续接收任务、调用工具、处理结果，并根据结果进行下一步操作，直到任务完成或被中止。

### 工作流说明

1.  **任务启动**: 流程由用户发起一个新任务 (`startTask`) 或从历史记录中恢复一个旧任务 (`resumeTaskFromHistory`) 开始。
2.  **进入主循环 (`initiateTaskLoop`)**: 这是整个代理行为的顶层循环。它的主要职责是调用核心递归函数 `recursivelyMakeClineRequests`，并在 AI 没有明确调用工具时，通过发送提示信息来推动任务继续进行。
3.  **准备与请求 (recursivelyMakeClineRequests)**:
    *   **准备上下文**: 在每次向 AI 发送请求前，系统会调用 `loadContext` 来收集当前的环境信息，例如：VSCode 中打开的文件、活动的终端、代码诊断错误等，并将这些信息与用户的输入（或上一步的工具结果）打包。
    *   **API 请求**: 将准备好的内容发送给大语言模型 API (`attemptApiRequest`)。
4.  **响应处理与决策**:
    *   系统会流式接收并解析 AI 的响应 (`parseAssistantMessage`)，将其分解为文本块和工具调用块 (`tool_use`)。
    *   **决策点**: 系统检查响应中是否包含工具调用。
5.  **工具执行流程 (Tool Execution)**:
    *   如果 AI 请求使用工具，系统会进入工具执行子流程。
    *   **用户批准**: 对于绝大多数会影响用户环境的工具（如写文件、执行命令），系统会弹窗向用户请求批准 (`askApproval`)。
    *   **执行或拒绝**: 如果用户批准，则执行相应的工具；如果用户拒绝，则生成一条“用户已拒绝”的结果。
    *   **收集结果**: 无论工具是成功执行还是被拒绝，其结果都会被收集起来。
6.  **递归循环**:
    *   工具执行的结果将作为新的输入，`recursivelyMakeClineRequests` 函数会**调用其自身**，开始新一轮的“准备上下文 -> API 请求 -> 处理响应”循环。这是代理能够进行多步推理和操作的关键。
7.  **处理纯文本响应**:
    *   如果 AI 的响应只是纯文本，没有调用任何工具，`initiateTaskLoop` 会判断任务是否已完成。如果 AI 没有调用 `attempt_completion` 来表示任务结束，主循环会发送一条特定的提示（例如：“请使用工具继续完成任务，或调用 attempt_completion 总结你的工作。”），然后再次进入 `recursivelyMakeClineRequests` 循环，强制 AI 继续工作。
8.  **任务结束**: 循环在以下几种情况下会终止：
    *   用户手动中止任务。
    *   发生不可恢复的 API 错误。
    *   AI 调用 `attempt_completion` 工具，并且用户确认任务完成（例如，点击“开始新任务”按钮）。

---

### 工作流 Mermaid 流程图

```mermaid
graph TD
    subgraph "1. 任务初始化"
        A[开始新任务<br>(startTask)]
        B[从历史恢复任务<br>(resumeTaskFromHistory)]
    end

    C(initiateTaskLoop: 启动主循环)

    A --> C
    B --> C

    subgraph "2. 核心代理循环 (Agentic Loop)"
        D[recursivelyMakeClineRequests: 循环入口]
        E[准备上下文和用户输入<br>(loadContext, parseMentions)]
        F[发送API请求<br>(attemptApiRequest)]
        G[流式接收并解析AI响应<br>(parseAssistantMessage)]
        H{响应中是否包含<br>工具调用 (tool_use)?}
    end

    C --> D
    D --> E
    E --> F
    F --> G
    G --> H

    subgraph "3a. 工具执行流程"
        I[执行工具调用<br>(presentAssistantMessage)]
        I1[向用户请求批准 (askApproval)]
        I2{用户是否批准?}
        I3[执行工具<br>(如: write_to_file, execute_command)]
        I4[生成'用户拒绝'的结果]
        K[收集所有工具结果]
    end
    
    H -- 是 --> I
    I --> I1
    I1 --> I2
    I2 -- 是 --> I3
    I2 -- 否 --> I4
    I3 --> K
    I4 --> K
    
    subgraph "3b. 纯文本响应处理"
        J[AI未调用工具]
        J1{是否调用了<br>attempt_completion?}
        J2[提示AI继续任务或完成<br>(formatResponse.noToolsUsed)]
        J3[向用户展示最终结果<br>并等待反馈/新任务]
    end

    H -- 否 --> J
    J --> J1
    J1 -- 否 --> J2
    J1 -- 是 --> J3

    subgraph "4. 循环与结束"
        L[递归调用: recursivelyMakeClineRequests<br>将工具结果作为新输入]
        Q[任务结束/中止]
    end
    
    K --> L
    J2 --> L
    L --> D

    J3 --> P{用户提供新反馈或<br>开始新任务?}
    P -- 提供反馈 --> K
    P -- 开始新任务 --> Q

    subgraph "任务中止条件"
        Abort1[用户取消操作]
        Abort2[不可恢复的API错误]
    end

    Abort1 --> Q
    Abort2 --> Q
```
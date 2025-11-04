```mermaid

graph TD
    subgraph "用户交互层 (User Interaction Layer)"
        direction LR
        UI_Webview["Webview UI (React)<br>聊天、设置、历史"]
        UI_Native["原生 VS Code UI<br>CodeAction, Completion, DiffView"]
    end

    subgraph "智能体层 (Agent Layer)"
        direction LR
        Agent_Core["核心智能体 (Cline.ts)<br>思考-行动循环、任务管理"]
        Agent_Mode["模式系统 (mode.ts)<br>权限与行为控制"]
    end

    subgraph "工具使用层 (Tool Usage Layer)"
        direction LR
        Tool_Services["核心服务<br>文件服务 (glob), 源码解析 (tree-sitter)"]
        Tool_API["VSCode API 封装<br>EditorUtils, Terminal, 文件系统"]
    end

    subgraph "数据交互层 (Data Interaction Layer)"
        direction LR
        Data_LLM["大模型 API 模块<br>ApiHandler, ApiStream"]
        Data_MCP["MCP 服务模块<br>McpHub (外部工具)"]
        Data_Comm["前后端通信协议"]
    end

    %% 定义主要流程和依赖关系
    UI_Webview -- "用户指令" --> Agent_Core
    UI_Native -- "用户操作" --> Agent_Core

    Agent_Core -- "1. 规划/决策" --> Data_LLM
    Data_LLM -- "2. 模型响应 (含工具调用)" --> Agent_Core

    Agent_Core -- "3. 调用内部工具" --> Tool_Services
    Agent_Core -- "3. 调用内部工具" --> Tool_API
    Tool_Services -- "4. 工具结果" --> Agent_Core
    Tool_API -- "4. 工具结果" --> Agent_Core

    Agent_Core -- "3. 调用外部工具" --> Data_MCP
    Data_MCP -- "4. 工具结果" --> Agent_Core

    Agent_Core -- "5. 渲染结果/更新UI" --> UI_Webview
    Agent_Core -- "5. 渲染结果/更新UI" --> UI_Native

    %% 层级依赖关系（虚线表示）
    style Agent_Core fill:#cde4ff
    style UI_Webview fill:#d4ffcd
    style UI_Native fill:#d4ffcd
    style Tool_Services fill:#fff2cd
    style Tool_API fill:#fff2cd
    style Data_LLM fill:#ffcdcd
    style Data_MCP fill:#ffcdcd
    style Data_Comm fill:#ffcdcd

```

```mermaid

graph TD
    %% --- Style Definitions ---
    classDef layer fill:#f8f9fa,stroke:#adb5bd,stroke-width:2px,rx:10,ry:10
    classDef component fill:#ffffff,stroke:#ced4da,stroke-width:1px,rx:5,ry:5

    %% --- Layer 1: User Interaction ---
    subgraph "用户交互层 (User Interaction Layer)"
        direction LR
        UI_Entry["上下文入口<br>(Contextual Entry Points)"]
        UI_Interface["对话界面<br>(Dialogue Interface)"]
    end

    %% --- Layer 2: Application Layer (The Core) ---
    subgraph "应用层 (Application Layer)"
        App_Controller["任务控制器<br>(Task Controller)"]
        App_Loop["任务循环<br>(Task Loop)"]
        App_State["状态管理器<br>(State Manager)"]
    end

    %% --- Layer 3: Tool Usage ---
    subgraph "工具使用层 (Tool Usage Layer)"
        Tool_Dispatcher["工具调度器<br>(Tool Dispatcher)"]
        Tools["各类工具<br>(Editor, Terminal, Browser, etc.)"]
    end

    %% --- Layer 4: Data Interaction ---
    subgraph "数据交互层 (Data Interaction Layer)"
        Data_LLM["大模型接口<br>(LLM Interface)"]
        Data_Context["环境上下文管理器<br>(Environment Context)"]
        Data_Memory["会话记忆与存储<br>(Memory & Storage)"]
    end

    %% --- Apply Component Styles ---
    class UI_Entry,UI_Interface,App_Controller,App_Loop,App_State,Tool_Dispatcher,Tools,Data_LLM,Data_Context,Data_Memory component

    %% --- Define Logical Connections (Arrows) ---

    % 1. User input flows to the Application Layer
    UI_Entry -- "用户指令" --> App_Controller
    UI_Interface -- "用户指令" --> App_Controller

    % 2. Application Layer is the central orchestrator
    App_Controller -- "编排任务" --> App_Loop
    App_Loop -.-> App_State

    % 3. Application Layer interacts with Data & Tool Layers
    App_Loop -- "调用大模型" --> Data_LLM
    App_Loop -- "获取上下文/历史" --> Data_Context
    App_Loop -- "获取上下文/历史" --> Data_Memory
    App_Loop -- "请求执行工具" --> Tool_Dispatcher

    % 4. Data & Tool Layers return results to the Application Layer
    Data_LLM -- "AI响应" --> App_Loop
    Tool_Dispatcher --> Tools
    Tools -- "工具结果" --> App_Loop
    Data_Context -- "上下文信息" --> App_Loop
    Data_Memory -- "历史记录" --> App_Loop
    App_State -- "读/写快照" --> Data_Memory


    % 5. Application Layer sends results back to the User Layer
    App_Loop -- "更新UI/显示结果" --> UI_Interface

end

```

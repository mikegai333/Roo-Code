```mermaid

graph TD
    %% --- Style Definitions ---
    classDef layer fill:#f8f9fa,stroke:#adb5bd,stroke-width:2px,rx:10,ry:10;
    classDef component fill:#ffffff,stroke:#ced4da,stroke-width:1px,rx:5,ry:5;

    %% --- Layer 1: User Interaction ---
    subgraph "用户交互层 (User Interaction Layer)"
        direction LR
        UI_Entry["上下文入口<br>(Contextual Entry Points)"];
        UI_Interface["对话界面<br>(Dialogue Interface)"];
    end

    %% --- Layer 2: Application Layer (The Core) ---
    subgraph "应用层 (Application Layer)"
        App_Controller["任务控制器<br>(Task Controller)"];
        App_Loop["任务循环<br>(Task Loop)"];
        App_State["状态管理器<br>(State Manager)"];
    end

    %% --- Layer 3: Tool Usage ---
    subgraph "工具使用层 (Tool Usage Layer)"
        Tool_Dispatcher["工具调度器<br>(Tool Dispatcher)"];
        Tools["各类工具<br>(Editor, Terminal, Browser, etc.)"];
    end

    %% --- Layer 4: Data Interaction ---
    subgraph "数据交互层 (Data Interaction Layer)"
        Data_LLM["大模型接口<br>(LLM Interface)"];
        Data_Context["环境上下文管理器<br>(Environment Context)"];
        Data_Memory["会话记忆与存储<br>(Memory & Storage)"];
    end

    %% --- Apply Component Styles ---
    class UI_Entry,UI_Interface,App_Controller,App_Loop,App_State,Tool_Dispatcher,Tools,Data_LLM,Data_Context,Data_Memory component;

    %% --- Define Logical Connections (Arrows) ---

    %% 1. User input flows to the Application Layer
    UI_Entry -- "用户指令" --> App_Controller;
    UI_Interface -- "用户指令" --> App_Controller;

    %% 2. Application Layer is the central orchestrator
    App_Controller -- "编排任务" --> App_Loop;
    App_Loop -.-> App_State;

    %% 3. Application Layer interacts with Data & Tool Layers
    App_Loop -- "调用大模型" --> Data_LLM;
    App_Loop -- "获取上下文/历史" --> Data_Context;
    App_Loop -- "获取上下文/历史" --> Data_Memory;
    App_Loop -- "请求执行工具" --> Tool_Dispatcher;

    %% 4. Data & Tool Layers return results to the Application Layer
    Data_LLM -- "AI响应" --> App_Loop;
    Tool_Dispatcher --> Tools;
    Tools -- "工具结果" --> App_Loop;
    Data_Context -- "上下文信息" --> App_Loop;
    Data_Memory -- "历史记录" --> App_Loop;
    App_State -- "读/写快照" --> Data_Memory;

    %% 5. Application Layer sends results back to the User Layer
    App_Loop -- "更新UI/显示结果" --> UI_Interface;

end

```

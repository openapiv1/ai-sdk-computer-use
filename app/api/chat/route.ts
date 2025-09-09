import { AzureOpenAI } from "openai";
import { UIMessage } from "ai";
import { killDesktop, getDesktop } from "@/lib/e2b/utils";
import { prunedMessages } from "@/lib/utils";
import dotenv from "dotenv";

dotenv.config();

// Computer tool function definition for OpenAI
const computerTool = {
  type: "function" as const,
  function: {
    name: "computer",
    description: "Use the computer to interact with the desktop environment. You can take screenshots, click, type, scroll, and perform other computer actions.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["screenshot", "left_click", "right_click", "double_click", "mouse_move", "type", "key", "scroll", "left_click_drag", "wait"],
          description: "The action to perform"
        },
        coordinate: {
          type: "array",
          items: { type: "number" },
          minItems: 2,
          maxItems: 2,
          description: "The x,y coordinate for mouse actions"
        },
        text: {
          type: "string",
          description: "Text to type or key to press"
        },
        duration: {
          type: "number",
          description: "Duration in seconds for wait action"
        },
        scroll_amount: {
          type: "number",
          description: "Amount to scroll"
        },
        scroll_direction: {
          type: "string",
          enum: ["up", "down"],
          description: "Direction to scroll"
        },
        start_coordinate: {
          type: "array",
          items: { type: "number" },
          minItems: 2,
          maxItems: 2,
          description: "Starting coordinate for drag action"
        }
      },
      required: ["action"]
    }
  }
};

// Bash tool function definition for OpenAI
const bashTool = {
  type: "function" as const,
  function: {
    name: "bash",
    description: "Execute bash commands on the computer.",
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "The bash command to execute"
        }
      },
      required: ["command"]
    }
  }
};

// Function to execute computer actions
async function executeComputerAction(sandboxId: string, args: {
  action: string;
  coordinate?: [number, number];
  text?: string;
  duration?: number;
  scroll_amount?: number;
  scroll_direction?: "up" | "down";
  start_coordinate?: [number, number];
}) {
  const desktop = await getDesktop(sandboxId);
  const { action, coordinate, text, duration, scroll_amount, scroll_direction, start_coordinate } = args;

  switch (action) {
    case "screenshot": {
      const image = await desktop.screenshot();
      const base64Data = Buffer.from(image).toString("base64");
      return { type: "image" as const, image: `data:image/png;base64,${base64Data}` };
    }
    case "left_click": {
      if (!coordinate) throw new Error("Coordinate required for left click action");
      const [x, y] = coordinate;
      await desktop.leftClick(x, y);
      return { type: "text" as const, text: `Left clicked at ${x}, ${y}` };
    }
    case "right_click": {
      if (!coordinate) throw new Error("Coordinate required for right click action");
      const [x, y] = coordinate;
      await desktop.rightClick(x, y);
      return { type: "text" as const, text: `Right clicked at ${x}, ${y}` };
    }
    case "double_click": {
      if (!coordinate) throw new Error("Coordinate required for double click action");
      const [x, y] = coordinate;
      await desktop.doubleClick(x, y);
      return { type: "text" as const, text: `Double clicked at ${x}, ${y}` };
    }
    case "mouse_move": {
      if (!coordinate) throw new Error("Coordinate required for mouse move action");
      const [x, y] = coordinate;
      await desktop.moveMouse(x, y);
      return { type: "text" as const, text: `Moved mouse to ${x}, ${y}` };
    }
    case "type": {
      if (!text) throw new Error("Text required for type action");
      await desktop.write(text);
      return { type: "text" as const, text: `Typed: ${text}` };
    }
    case "key": {
      if (!text) throw new Error("Key required for key action");
      await desktop.press(text === "Return" ? "enter" : text);
      return { type: "text" as const, text: `Pressed key: ${text}` };
    }
    case "scroll": {
      if (!scroll_direction) throw new Error("Scroll direction required for scroll action");
      if (!scroll_amount) throw new Error("Scroll amount required for scroll action");
      await desktop.scroll(scroll_direction as "up" | "down", scroll_amount);
      return { type: "text" as const, text: `Scrolled ${scroll_direction} by ${scroll_amount}` };
    }
    case "left_click_drag": {
      if (!start_coordinate || !coordinate) throw new Error("Start and end coordinates required for drag action");
      const [startX, startY] = start_coordinate;
      const [endX, endY] = coordinate;
      await desktop.drag([startX, startY], [endX, endY]);
      return { type: "text" as const, text: `Dragged mouse from ${startX}, ${startY} to ${endX}, ${endY}` };
    }
    case "wait": {
      const seconds = duration || 1;
      await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
      return { type: "text" as const, text: `Waited for ${seconds} seconds` };
    }
    default:
      throw new Error(`Unsupported action: ${action}`);
  }
}

// Function to execute bash commands
async function executeBashCommand(sandboxId: string, args: { command: string }) {
  const desktop = await getDesktop(sandboxId);
  const { command } = args;
  
  if (!command) throw new Error("Command required for bash action");
  
  try {
    const result = await desktop.commands.run(command);
    return { type: "text" as const, text: `Command: ${command}\nOutput: ${result.stdout || "(Command executed successfully with no output)"}` };
  } catch (error) {
    console.error("Bash command failed:", error);
    if (error instanceof Error) {
      return { type: "text" as const, text: `Error executing command: ${error.message}` };
    } else {
      return { type: "text" as const, text: `Error executing command: ${String(error)}` };
    }
  }
}

// Allow streaming responses up to 30 seconds
export const maxDuration = 300;

export async function POST(req: Request) {
  const { messages, sandboxId }: { messages: UIMessage[]; sandboxId: string } =
    await req.json();
  try {
    // Configure Azure OpenAI client
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT || "https://ai-radoslawgryga3465ai579522695324.cognitiveservices.azure.com/";
    const apiKey = process.env.AZURE_OPENAI_API_KEY || "43aXKuwwCgFvddXFFKMxXO8dfHA9Rt8Z2W76YY961D50Em5PX0hbJQQJ99BGACfhMk5XJ3w3AAAAACOGipRN";
    const apiVersion = "2025-01-01-preview";
    const deployment = "gpt-4.1";

    const client = new AzureOpenAI({ 
      endpoint, 
      apiKey, 
      apiVersion, 
      deployment 
    });

    // Convert UI messages to OpenAI format
    const openAIMessages = prunedMessages(messages).map(msg => {
      if (msg.role === 'user') {
        return {
          role: 'user' as const,
          content: msg.content
        };
      } else if (msg.role === 'assistant') {
        const textContent = msg.parts?.find(part => part.type === 'text')?.text || '';
        return {
          role: 'assistant' as const,
          content: textContent
        };
      }
      return {
        role: 'system' as const,
        content: msg.content
      };
    });

    // Add system message
    const messagesWithSystem = [
      {
        role: 'system' as const,
        content: "Jesteś asystentem AI, który ułatwia użytkownikom znajdowanie informacji. " +
                "Masz dostęp do komputera. " +
                "Używaj narzędzia komputera, aby pomóc użytkownikom w ich zadaniach. " +
                "Używaj narzędzia bash do wykonywania poleceń na komputerze. Możesz tworzyć pliki i foldery za pomocą narzędzia bash. Zawsze preferuj narzędzie bash, gdy jest to możliwe dla zadania. " +
                "Upewnij się, że informujesz użytkownika, gdy oczekiwanie jest konieczne. " +
                "Jeśli przeglądarka otworzy się z kreatorem konfiguracji, MUSISZ GO ZIGNOROWAĆ i przejść bezpośrednio do następnego kroku (np. wprowadź adres URL w pasku wyszukiwania)."
      },
      ...openAIMessages
    ];

    // Create completion with Azure OpenAI with tool calling
    const response = await client.chat.completions.create({
      model: deployment,
      messages: messagesWithSystem,
      tools: [computerTool, bashTool],
      tool_choice: "auto",
      max_tokens: 16384,
      temperature: 0.7,
      top_p: 0.95,
      frequency_penalty: 0,
      presence_penalty: 0,
      stop: null,
      stream: true
    });

    // Create streaming response that handles tool calls
    return new Response(
      new ReadableStream({
        async start(controller) {
          try {
            let toolCallBuffer = '';
            let toolName = '';
            
            for await (const chunk of response) {
              const choice = chunk.choices[0];
              
              if (choice?.delta?.content) {
                // Regular text content
                const data = `data: ${JSON.stringify({
                  choices: [{
                    delta: { content: choice.delta.content }
                  }]
                })}\n\n`;
                controller.enqueue(new TextEncoder().encode(data));
              }
              
              if (choice?.delta?.tool_calls) {
                // Tool call handling
                const toolCall = choice.delta.tool_calls[0];
                
                if (toolCall?.function?.name) {
                  toolName = toolCall.function.name;
                }
                
                if (toolCall?.function?.arguments) {
                  toolCallBuffer += toolCall.function.arguments;
                }
                
                // If this is the end of tool call
                if (choice.finish_reason === 'tool_calls') {
                  try {
                    const args = JSON.parse(toolCallBuffer);
                    let result;
                    
                    if (toolName === 'computer') {
                      result = await executeComputerAction(sandboxId, args);
                    } else if (toolName === 'bash') {
                      result = await executeBashCommand(sandboxId, args);
                    } else {
                      result = { type: "text" as const, text: `Unknown tool: ${toolName}` };
                    }
                    
                    // Send tool result back to the client
                    const resultData = `data: ${JSON.stringify({
                      choices: [{
                        delta: { 
                          content: `\n[Tool ${toolName} executed: ${result.text}]\n`
                        }
                      }]
                    })}\n\n`;
                    controller.enqueue(new TextEncoder().encode(resultData));
                    
                    // Reset for next tool call
                    toolCallBuffer = '';
                    toolName = '';
                  } catch (error) {
                    console.error('Tool execution error:', error);
                    const errorData = `data: ${JSON.stringify({
                      choices: [{
                        delta: { 
                          content: `\n[Error executing ${toolName}: ${error}]\n`
                        }
                      }]
                    })}\n\n`;
                    controller.enqueue(new TextEncoder().encode(errorData));
                  }
                }
              }
              
              if (choice?.finish_reason === 'stop') {
                break;
              }
            }
            
            controller.enqueue(new TextEncoder().encode(`data: [DONE]\n\n`));
            controller.close();
          } catch (error) {
            console.error('Streaming error:', error);
            controller.error(error);
          }
        }
      }),
      {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      }
    );
  } catch (error) {
    console.error("Chat API error:", error);
    await killDesktop(sandboxId); // Force cleanup on error
    return new Response(JSON.stringify({ error: "Internal Server Error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

import { tool } from "ai";
import { z } from "zod";
import { getDesktop } from "./utils";

const wait = async (seconds: number) => {
  await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
};

export const resolution = { x: 1024, y: 768 };

export const computerTool = (sandboxId: string) =>
  tool({
    description: "Use the computer to interact with the desktop environment. You can take screenshots, click, type, scroll, and perform other computer actions.",
    parameters: z.object({
      action: z.enum([
        "screenshot",
        "left_click",
        "right_click", 
        "double_click",
        "mouse_move",
        "type",
        "key",
        "scroll",
        "left_click_drag",
        "wait"
      ]).describe("The action to perform"),
      coordinate: z.array(z.number()).length(2).optional().describe("The x,y coordinate for mouse actions"),
      text: z.string().optional().describe("Text to type or key to press"),
      duration: z.number().optional().describe("Duration in seconds for wait action"),
      scroll_amount: z.number().optional().describe("Amount to scroll"),
      scroll_direction: z.enum(["up", "down"]).optional().describe("Direction to scroll"),
      start_coordinate: z.array(z.number()).length(2).optional().describe("Starting coordinate for drag action"),
    }),
    execute: async ({
      action,
      coordinate,
      text,
      duration,
      scroll_amount,
      scroll_direction,
      start_coordinate,
    }) => {
      const desktop = await getDesktop(sandboxId);

      switch (action) {
        case "screenshot": {
          const image = await desktop.screenshot();
          // Convert image data to base64 immediately
          const base64Data = Buffer.from(image).toString("base64");
          return {
            type: "image" as const,
            data: base64Data,
          };
        }
        case "wait": {
          if (!duration) throw new Error("Duration required for wait action");
          const actualDuration = Math.min(duration, 2);
          await wait(actualDuration);
          return {
            type: "text" as const,
            text: `Waited for ${actualDuration} seconds`,
          };
        }
        case "left_click": {
          if (!coordinate)
            throw new Error("Coordinate required for left click action");
          const [x, y] = coordinate;
          await desktop.moveMouse(x, y);
          await desktop.leftClick();
          return { type: "text" as const, text: `Left clicked at ${x}, ${y}` };
        }
        case "double_click": {
          if (!coordinate)
            throw new Error("Coordinate required for double click action");
          const [x, y] = coordinate;
          await desktop.moveMouse(x, y);
          await desktop.doubleClick();
          return {
            type: "text" as const,
            text: `Double clicked at ${x}, ${y}`,
          };
        }
        case "right_click": {
          if (!coordinate)
            throw new Error("Coordinate required for right click action");
          const [x, y] = coordinate;
          await desktop.moveMouse(x, y);
          await desktop.rightClick();
          return { type: "text" as const, text: `Right clicked at ${x}, ${y}` };
        }
        case "mouse_move": {
          if (!coordinate)
            throw new Error("Coordinate required for mouse move action");
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
          if (!scroll_direction)
            throw new Error("Scroll direction required for scroll action");
          if (!scroll_amount)
            throw new Error("Scroll amount required for scroll action");

          await desktop.scroll(
            scroll_direction as "up" | "down",
            scroll_amount,
          );
          return { type: "text" as const, text: `Scrolled ${scroll_direction} by ${scroll_amount}` };
        }
        case "left_click_drag": {
          if (!start_coordinate || !coordinate)
            throw new Error("Start and end coordinates required for drag action");
          const [startX, startY] = start_coordinate;
          const [endX, endY] = coordinate;

          await desktop.drag([startX, startY], [endX, endY]);
          return {
            type: "text" as const,
            text: `Dragged mouse from ${startX}, ${startY} to ${endX}, ${endY}`,
          };
        }
        default:
          throw new Error(`Unsupported action: ${action}`);
      }
    },
  });

export const bashTool = (sandboxId?: string) =>
  tool({
    description: "Execute bash commands on the computer. Use this tool to run shell commands, create files, manage directories, and perform system operations.",
    parameters: z.object({
      command: z.string().describe("The bash command to execute"),
    }),
    execute: async ({ command }) => {
      const desktop = await getDesktop(sandboxId);

      try {
        const result = await desktop.commands.run(command);
        return (
          result.stdout || "(Command executed successfully with no output)"
        );
      } catch (error) {
        console.error("Bash command failed:", error);
        if (error instanceof Error) {
          return `Error executing command: ${error.message}`;
        } else {
          return `Error executing command: ${String(error)}`;
        }
      }
    },
  });

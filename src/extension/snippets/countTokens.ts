import { Tiktoken, encodingForModel as _encodingForModel } from "js-tiktoken";
import llamaTokenizer from "./llamaTokenizer.js";


interface Encoding {
  encode: Tiktoken["encode"];
  decode: Tiktoken["decode"];
}

type MessageContent = string;




class LlamaEncoding implements Encoding {
  encode(text: string): number[] {
    return llamaTokenizer.encode(text);
  }
  
  decode(tokens: number[]): string {
    return llamaTokenizer.decode(tokens);
  }
}
const llamaEncoding = new LlamaEncoding();

function countTokens(
  content: MessageContent,
  // defaults to llama2 because the tokenizer tends to produce more tokens
  modelName = "llama2",
): number {
  const encoding = encodingForModel(modelName);
  return encoding.encode(content ?? "", "all", []).length;
}

function encodingForModel(modelName: string): Encoding {

  return llamaEncoding;
}


export {
  countTokens,
};

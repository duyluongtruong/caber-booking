import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type { CardPaymentInput } from "../adapters/clubspark/pay.js";

export async function readCardFromStdin(): Promise<CardPaymentInput> {
  const rl = readline.createInterface({ input, output });
  try {
    const cardNumber = (await rl.question("Card number: ")).trim();
    const expiry = (await rl.question("Expiry (MM/YY): ")).trim();
    const cvc = (await rl.question("CVC: ")).trim();
    if (!cardNumber || !expiry || !cvc) {
      throw new Error("Card number, expiry, and CVC are required");
    }
    return { cardNumber, expiry, cvc };
  } finally {
    rl.close();
  }
}

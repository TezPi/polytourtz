import type { BotDifficulty } from "../../shared/engine/index.js";
import { translate } from "../i18n.js";

export function botDifficultyName(difficulty: BotDifficulty = "medium") {
  switch (difficulty) {
    case "easy":
      return translate("Facile", "Easy", "Dễ");
    case "medium":
      return translate("Moyen", "Medium", "Trung bình");
    case "hard":
      return translate("Difficile", "Hard", "Khó");
  }
}

export function nextBotDifficulty(difficulty: BotDifficulty): BotDifficulty {
  return difficulty === "easy"
    ? "medium"
    : difficulty === "medium"
      ? "hard"
      : "easy";
}

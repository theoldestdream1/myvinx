import { parseImageUnderstanding, extractCitations, buildSearchText } from "./fn/_shared/text.ts";
let fails = 0;
const eq = (n: string, got: unknown, want: unknown) => { const ok = JSON.stringify(got) === JSON.stringify(want); console.log((ok ? "PASS " : "FAIL ") + n + (ok ? "" : `\n   got  ${JSON.stringify(got)}\n   want ${JSON.stringify(want)}`)); if (!ok) fails++; };

// --- vision output parsing ---
eq("well-formed", parseImageUnderstanding("VISIBLE TEXT: none\nDESCRIPTION: A pencil drawing of a girl."), { text: "", description: "A pencil drawing of a girl." });
eq("text + multiline description", parseImageUnderstanding("VISIBLE TEXT: Pricing\nPro $15/mo\nDESCRIPTION: A screenshot of a pricing page.\nIt shows two plans."),
  { text: "Pricing\nPro $15/mo", description: "A screenshot of a pricing page.\nIt shows two plans." });
eq("lowercase headers + code fence", parseImageUnderstanding("```\nvisible text: N/A\ndescription: A cat on a sofa.\n```"), { text: "", description: "A cat on a sofa." });
eq("'No visible text.' treated as none", parseImageUnderstanding("VISIBLE TEXT: No visible text.\nDESCRIPTION: Sunset."), { text: "", description: "Sunset." });
eq("model ignores format -> whole reply becomes the description", parseImageUnderstanding("A black and white sketch of a girl scribbling."), { text: "", description: "A black and white sketch of a girl scribbling." });
eq("only DESCRIPTION header", parseImageUnderstanding("DESCRIPTION: A meme about Mondays."), { text: "", description: "A meme about Mondays." });
eq("empty reply", parseImageUnderstanding(""), { text: "", description: "" });

// --- citations ---
eq("single", extractCitations("It was on Friday [1].", 5), [1]);
eq("adjacent [2][3]", extractCitations("Both [2][3] agree.", 5), [2, 3]);
eq("comma list [1, 4]", extractCitations("See [1, 4].", 5), [1, 4]);
eq("out-of-range ignored", extractCitations("[9] and [0] and [2]", 3), [2]);
eq("dedup + sorted", extractCitations("[3] then [1] then [3]", 5), [1, 3]);
eq("no citations", extractCitations("I couldn't find anything.", 5), []);
eq("brackets that aren't citations", extractCitations("array[idx] and [abc] and (1)", 5), []);

// --- search text ---
eq("drops empties, trims, joins", buildSearchText(["Title", "", null, undefined, "  Summary  ", "   "]), "Title\nSummary");
eq("respects limit", buildSearchText(["x".repeat(100)], 10).length, 10);

console.log(fails ? `\n${fails} FAILED` : "\nALL TEXT HELPER CHECKS PASSED");
Deno.exit(fails ? 1 : 0);

import json
import os

log_path = r"C:\Users\Junaid\.gemini\antigravity-ide\brain\ba68c772-1140-45a1-91d1-9482af4e3892\.system_generated\logs\transcript_full.jsonl"
out_dir = r"d:\GST SAAS\docs"

counter = 1
seen_contents = set()

with open(log_path, 'r', encoding='utf-8') as f:
    for line in f:
        try:
            data = json.loads(line.strip())
            if data.get("type") == "PLANNER_RESPONSE":
                tool_calls = data.get("tool_calls", [])
                for tc in tool_calls:
                    name = tc.get("name")
                    if name in ("write_to_file", "replace_file_content", "multi_replace_file_content"):
                        args = tc.get("args", {})
                        target = args.get("TargetFile", "")
                        if "walkthrough.md" in target.lower():
                            content = None
                            if name == "write_to_file":
                                content = args.get("CodeContent")
                            elif name == "replace_file_content":
                                content = args.get("ReplacementContent")
                            elif name == "multi_replace_file_content":
                                chunks = args.get("ReplacementChunks", [])
                                if chunks:
                                    content = chunks[0].get("ReplacementContent")
                            
                            if content and content not in seen_contents:
                                seen_contents.add(content)
                                out_path = os.path.join(out_dir, f"historical_walkthrough_{counter}.md")
                                with open(out_path, 'w', encoding='utf-8') as out_f:
                                    out_f.write(content)
                                counter += 1
        except Exception as e:
            pass

print(f"Extracted {counter-1} historical walkthrough versions.")

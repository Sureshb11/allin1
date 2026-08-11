import json
import re

transcript_path = "/Users/sureshbala/.gemini/antigravity-ide/brain/4f1a279a-41d5-44a2-a6eb-559c2c84ac78/.system_generated/logs/transcript_full.jsonl"

def apply_patch(content, chunks):
    # This is a bit tricky, but we can just use the target content and replace it
    # However, since the chunks specify StartLine and EndLine, we can just replace the lines.
    lines = content.split('\n')
    # Sort chunks in reverse order by StartLine to avoid shifting lines
    chunks.sort(key=lambda x: x.get('StartLine', 0), reverse=True)
    
    for chunk in chunks:
        start = chunk.get('StartLine', 1) - 1
        end = chunk.get('EndLine', 1)
        # target = chunk.get('TargetContent', '')
        replacement = chunk.get('ReplacementContent', '')
        # replace the lines
        lines[start:end] = replacement.split('\n')
    
    return '\n'.join(lines)

def process_file():
    # Read the initial file contents from git (Aug 6)
    import subprocess
    import os
    os.chdir('/Volumes/BSB/allin1-local')
    
    files = {
        'frontend/src/screens/HomeScreen.js': subprocess.check_output(['git', 'show', '965e654e30a6cfa01ea490a652dbbc4063c337f6:frontend/src/screens/HomeScreen.js']).decode('utf-8'),
        'frontend/src/screens/TournamentsScreen.js': subprocess.check_output(['git', 'show', '965e654e30a6cfa01ea490a652dbbc4063c337f6:frontend/src/screens/TournamentsScreen.js']).decode('utf-8'),
        'frontend/src/screens/TeamManagementScreen.js': subprocess.check_output(['git', 'show', '965e654e30a6cfa01ea490a652dbbc4063c337f6:frontend/src/screens/TeamManagementScreen.js']).decode('utf-8'),
    }
    
    with open(transcript_path, 'r') as f:
        for line in f:
            obj = json.loads(line)
            if obj.get('type') == 'PLANNER_RESPONSE' and 'tool_calls' in obj:
                for tc in obj['tool_calls']:
                    if tc['name'] == 'multi_replace_file_content':
                        args = tc['args']
                        target = args.get('TargetFile', '')
                        for k in files:
                            if target.endswith(k):
                                # check if it's before today
                                created = obj.get('created_at', '')
                                if created.startswith('2026-08-08'):
                                    print(f"Applying patch to {k} at {created}")
                                    files[k] = apply_patch(files[k], args.get('ReplacementChunks', []))
                    elif tc['name'] == 'replace_file_content':
                        args = tc['args']
                        target = args.get('TargetFile', '')
                        for k in files:
                            if target.endswith(k):
                                created = obj.get('created_at', '')
                                if created.startswith('2026-08-08'):
                                    print(f"Applying patch to {k} at {created}")
                                    files[k] = apply_patch(files[k], [args])
    
    for k, content in files.items():
        with open(k, 'w') as f:
            f.write(content)
        print(f"Saved {k}")

if __name__ == '__main__':
    process_file()

import re

with open("/Users/sureshbala/.gemini/antigravity-ide/brain/9542e6e8-dadd-4039-a35f-08a15a66d63d/scratch/CricketFeedScreen.js", "r") as f:
    content = f.read()

content = content.replace("function FeedSkeleton", "export function FeedSkeleton")
content = content.replace("function PostCard", "export function PostCard")
content = content.replace("function CommentsSheet", "export function CommentsSheet")

with open("frontend/src/components/FeedShared.js", "w") as f:
    f.write(content)

with open("frontend/src/components/PostCard.js", "w") as f:
    f.write("export { PostCard as default } from './FeedShared';\n")

with open("frontend/src/components/FeedSkeleton.js", "w") as f:
    f.write("export { FeedSkeleton as default } from './FeedShared';\n")

with open("frontend/src/components/CommentsSheet.js", "w") as f:
    f.write("export { CommentsSheet as default } from './FeedShared';\n")

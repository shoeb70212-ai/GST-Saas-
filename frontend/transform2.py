import re

with open('src/pages/LandingPage.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

# Add imports for our new hooks if not present
if 'useStaggerReveal' not in code:
    code = code.replace("import KhataLensIcon from '../components/KhataLensIcon';", 
                        "import KhataLensIcon from '../components/KhataLensIcon';\nimport { useCountUp, useStaggerReveal, useAnimeOnScroll } from '../hooks/useAnimeOnScroll';")

    code = code.replace(
        'export default function LandingPage() {',
        'export default function LandingPage() {\n  const staggerRef = useStaggerReveal("[data-anime]", { translateY: 30, duration: 800 });'
    )

# 1. Replace staggers
code = re.sub(
    r'<motion\.div\s+initial="hidden"\s+whileInView="visible"\s+viewport=\{\{\s*once:\s*true[^}]*\}\}\s+variants=\{stagger\}([^>]*)>',
    r'<div ref={staggerRef}\1>',
    code
)

# 2. Replace fades
code = re.sub(
    r'<motion\.div\s+initial="hidden"\s+whileInView="visible"\s+viewport=\{\{\s*once:\s*true[^}]*\}\}\s+variants=\{fadeUp\}([^>]*)>',
    r'<div data-anime\1>',
    code
)
code = re.sub(
    r'<motion\.div\s+variants=\{fadeUp\}([^>]*)>',
    r'<div data-anime\1>',
    code
)
code = re.sub(
    r'<motion\.div\s+variants=\{fadeLeft\}([^>]*)>',
    r'<div data-anime\1>',
    code
)
code = re.sub(
    r'<motion\.div\s+variants=\{fadeRight\}([^>]*)>',
    r'<div data-anime\1>',
    code
)
code = re.sub(
    r'<motion\.div\s+initial=\{\{\s*opacity:\s*0,\s*scale:\s*0\.85\s*\}\}\s+whileInView=\{\{\s*opacity:\s*1,\s*scale:\s*1\s*\}\}\s+viewport=\{\{\s*once:\s*true\s*\}\}\s+transition=\{[^}]+\}([^>]*)>',
    r'<div data-anime\1>',
    code
)
code = re.sub(
    r'<motion\.div\s+initial=\{\{\s*opacity:\s*0,\s*y:\s*20\s*\}\}\s+whileInView=\{\{\s*opacity:\s*1,\s*y:\s*0\s*\}\}\s+viewport=\{\{\s*once:\s*true\s*\}\}\s+transition=\{[^}]+\}([^>]*)>',
    r'<div data-anime\1>',
    code
)
code = re.sub(
    r'<motion\.div\s+initial=\{\{\s*opacity:\s*0,\s*x:\s*-40\s*\}\}\s+animate=\{\{\s*opacity:\s*1,\s*x:\s*0\s*\}\}\s+transition=\{[^}]+\}([^>]*)>',
    r'<div data-anime\1>',
    code
)
code = re.sub(
    r'<motion\.div\s+initial=\{\{\s*opacity:\s*0,\s*y:\s*10\s*\}\}\s+animate=\{\{\s*opacity:\s*1,\s*y:\s*0\s*\}\}\s+transition=\{[^}]+\}([^>]*)>',
    r'<div data-anime\1>',
    code
)
code = re.sub(
    r'<motion\.div\s+initial=\{\{\s*opacity:\s*0,\s*scale:\s*0\.94,\s*y:\s*20\s*\}\}\s+animate=\{\{\s*opacity:\s*1,\s*scale:\s*1,\s*y:\s*0\s*\}\}\s+transition=\{[^}]+\}([^>]*)>',
    r'<div data-anime\1>',
    code
)


# Replace closing tags. We must ONLY replace </motion.div> for the tags we opened.
# A safe way is to split by lines, and if a line contains `<div data-anime` or `<div ref={staggerRef}`, we know we transformed a tag.
# Let's write a small state machine.
new_lines = []
motion_stack = []

for line in code.split('\n'):
    original_line = line
    
    # Check for opening tags
    matches = re.findall(r'<motion\.div|<div data-anime|<div ref=\{staggerRef\}|<div className=\{`h-full rounded-full', line)
    for m in matches:
        if m == '<motion.div':
            motion_stack.append('motion')
        else:
            # We transformed one! But wait, regex already did it. So we don't see '<motion.div' anymore for transformed ones.
            pass

    # Wait, the regex replaced them ALREADY in the whole file `code` string.
    # We should do line-by-line replacement from the ORIGINAL string so we can track matching.
    pass

with open('src/pages/LandingPage_test.tsx', 'w', encoding='utf-8') as f:
    f.write(code)

print("Check LandingPage_test.tsx")

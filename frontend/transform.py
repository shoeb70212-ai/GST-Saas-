import re

with open('src/pages/LandingPage.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

# Fix factual error
code = code.replace('"Custom column mapping for any software"', '"Native Tally XML voucher export"')

# Remove framer-motion variants
code = re.sub(r'// ─── Animation Variants ───[\s\S]*?const stagger = \{[\s\S]*?\};\n', '', code)

# We want to keep AnimatePresence and motion for FaqItem and Mobile menu
# How do we differentiate?
# FaqItem uses motion.div with initial={{ height: 0, opacity: 0 }}
# Mobile menu uses motion.div with initial={{ opacity: 0, height: 0 }}
# All the page animations use variants={fadeUp}, variants={fadeLeft}, variants={stagger}

# Let's replace the page animations with our anime.js hooks.
# To do this safely, we will replace the exact opening tags.
code = re.sub(
    r'<motion\.div\s+initial="hidden"\s+whileInView="visible"\s+viewport=\{\{\s*once:\s*true[^}]*\}\}\s+variants=\{stagger\}([^>]*)>',
    r'<div data-stagger-parent\1>',
    code
)
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

# And replace <motion.div initial={{ opacity: 0, scale: 0.85 }} ...
code = re.sub(
    r'<motion\.div\s+initial=\{\{\s*opacity:\s*0,\s*scale:\s*0\.85\s*\}\}\s+whileInView=\{\{\s*opacity:\s*1,\s*scale:\s*1\s*\}\}\s+viewport=\{\{\s*once:\s*true\s*\}\}\s+transition=\{[^}]+\}([^>]*)>',
    r'<div data-anime\1>',
    code
)

# And replace <motion.div initial={{ opacity: 0, x: -40 }} ...
code = re.sub(
    r'<motion\.div\s+initial=\{\{\s*opacity:\s*0,\s*x:\s*-40\s*\}\}\s+animate=\{\{\s*opacity:\s*1,\s*x:\s*0\s*\}\}\s+transition=\{[^}]+\}([^>]*)>',
    r'<div data-anime\1>',
    code
)

# And replace <motion.div initial={{ opacity: 0, y: 10 }} ...
code = re.sub(
    r'<motion\.div\s+initial=\{\{\s*opacity:\s*0,\s*y:\s*10\s*\}\}\s+animate=\{\{\s*opacity:\s*1,\s*y:\s*0\s*\}\}\s+transition=\{[^}]+\}([^>]*)>',
    r'<div data-anime\1>',
    code
)

# And replace <motion.div initial={{ opacity: 0, scale: 0.94, y: 20 }} ...
code = re.sub(
    r'<motion\.div\s+initial=\{\{\s*opacity:\s*0,\s*scale:\s*0\.94,\s*y:\s*20\s*\}\}\s+animate=\{\{\s*opacity:\s*1,\s*scale:\s*1,\s*y:\s*0\s*\}\}\s+transition=\{[^}]+\}([^>]*)>',
    r'<div data-anime\1>',
    code
)

# And replace <motion.div initial={{ opacity: 0, y: 20 }} ...
code = re.sub(
    r'<motion\.div\s+initial=\{\{\s*opacity:\s*0,\s*y:\s*20\s*\}\}\s+whileInView=\{\{\s*opacity:\s*1,\s*y:\s*0\s*\}\}\s+viewport=\{\{\s*once:\s*true\s*\}\}\s+transition=\{[^}]+\}([^>]*)>',
    r'<div data-anime\1>',
    code
)

# And replace <motion.div className={`h-full rounded-full ...
code = re.sub(
    r'<motion\.div\s+className=\{`([^`]+)`\}\s+initial=\{\{\s*width:\s*0\s*\}\}\s+whileInView=\{\{\s*width:\s*\$`\{item\.pct\}%`\s*\}\}\s+viewport=\{\{\s*once:\s*true\s*\}\}\s+transition=\{[^}]+\}\s*/>',
    r'<div className={`\1`} style={{ width: `${item.pct}%` }} data-anime />',
    code
)


# Now to balance closing tags. We only have a few <motion.div> left.
# We will find all <motion.div> and </motion.div> and balance them.
lines = code.split('\n')
in_motion = 0
for i, line in enumerate(lines):
    if '<motion.div' in line:
        in_motion += 1
    if '</motion.div>' in line:
        if in_motion > 0:
            in_motion -= 1
        else:
            lines[i] = line.replace('</motion.div>', '</div>')

code = '\n'.join(lines)

# Inject the hooks in the main component
if 'useStaggerReveal' not in code:
    # Need to add import
    pass

code = code.replace(
    'export default function LandingPage() {',
    'export default function LandingPage() {\n  const staggerRef = useStaggerReveal("[data-anime]", { translateY: 30, duration: 800 });\n  const staggerParentRefs = [\n    useStaggerReveal("[data-anime]"),\n    useStaggerReveal("[data-anime]"),\n    useStaggerReveal("[data-anime]"),\n    useStaggerReveal("[data-anime]"),\n    useStaggerReveal("[data-anime]"),\n    useStaggerReveal("[data-anime]"),\n    useStaggerReveal("[data-anime]")\n  ];'
)

# In the JSX, we need to attach refs to data-stagger-parent
import random
def replace_stagger_parent(match):
    return match.group(0).replace('data-stagger-parent', 'ref={staggerRef}')

code = re.sub(r'<div data-stagger-parent[^>]*>', replace_stagger_parent, code)

with open('src/pages/LandingPage.tsx', 'w', encoding='utf-8') as f:
    f.write(code)

print("Updated LandingPage.tsx")

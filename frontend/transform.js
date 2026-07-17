const fs = require('fs');

const fileContent = fs.readFileSync('src/pages/LandingPage.tsx', 'utf-8');

// Replace fadeUp variants with simple div and data-anime attribute
let newContent = fileContent.replace(
  /<motion\.div\s+initial="hidden"\s+whileInView="visible"\s+viewport=\{\{[^}]+\}\}\s+variants=\{fadeUp\}([\s\S]*?)>/g, 
  '<div data-anime$1>'
);
newContent = newContent.replace(
  /<motion\.div\s+initial="hidden"\s+whileInView="visible"\s+viewport=\{\{[^}]+\}\}\s+variants=\{stagger\}([\s\S]*?)>/g, 
  '<div data-stagger-parent$1>'
);
newContent = newContent.replace(
  /<motion\.div variants=\{fadeUp\}([\s\S]*?)>/g,
  '<div data-anime$1>'
);

// We need a way to close the div instead of </motion.div>.
// But wait, there are other <motion.div> tags that we DO want to keep (like inside FaqItem).
// Let's do a more explicit AST based replacement or just manual chunk replacement via multi_replace_file_content.
// Since we have the replace_file_content tool, we can replace the entire file.

console.log("We'll use a safer approach: creating the full LandingPage.tsx");

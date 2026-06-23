const fs = require('fs');
const path = require('path');

const servicesDir = path.join(__dirname, 'apps/api/src/services');

const repairFile = (filename, schemas) => {
    let content = fs.readFileSync(path.join(servicesDir, filename), 'utf8');
    
    // 1. Restore sql import from drizzle-orm if it has 'desc' or 'eq'
    if (!content.includes('import { sql')) {
        content = content.replace(/import {([^}]+)} from "drizzle-orm";/, (match, group1) => {
            if (!group1.includes('sql')) {
                return `import { sql, ${group1.trim()} } from "drizzle-orm";`;
            }
            return match;
        });
    }

    // 2. Restore missing schema destructurings
    // Replace const { users } = schema; with const { users, schemas... } = schema;
    content = content.replace(/const {([^}]+)} = schema;/g, (match, group1) => {
        const existing = group1.split(',').map(s => s.trim()).filter(Boolean);
        for (const s of schemas) {
            if (!existing.includes(s)) existing.push(s);
        }
        return `const { ${existing.join(', ')} } = schema;`;
    });

    // 3. Restore sql`...` syntax
    // It was turned from sql`(SELECT ...)` into `(SELECT ...)`
    content = content.replace(/<number>`/g, '<number>sql`');
    content = content.replace(/<boolean>`/g, '<boolean>sql`');
    content = content.replace(/:\s*`\(SELECT/g, ': sql`(SELECT');
    content = content.replace(/:\s*`EXISTS/g, ': sql`EXISTS');
    content = content.replace(/:\s*`0`/g, ': sql`0`');
    content = content.replace(/:\s*`1`/g, ': sql`1`');

    fs.writeFileSync(path.join(servicesDir, filename), content);
};

repairFile('bookmarks.service.ts', ['users', 'posts', 'bookmarks', 'likes', 'comments']);
repairFile('comments.service.ts', ['users', 'posts', 'comments', 'likes']);
repairFile('feed.service.ts', ['users', 'posts', 'follows', 'likes', 'comments']);
repairFile('posts.service.ts', ['users', 'posts', 'likes', 'comments']);
repairFile('search.service.ts', ['users', 'posts', 'likes', 'comments']);
repairFile('users.service.ts', ['users', 'follows', 'posts']);

// Also fix comments.service.ts missing `and`, `isNull` in imports
let commentsContent = fs.readFileSync(path.join(servicesDir, 'comments.service.ts'), 'utf8');
if (!commentsContent.includes('isNull')) {
    commentsContent = commentsContent.replace(/import {([^}]+)} from "drizzle-orm";/, (match, group1) => {
        return `import { isNull, and, ${group1.trim()} } from "drizzle-orm";`;
    });
    fs.writeFileSync(path.join(servicesDir, 'comments.service.ts'), commentsContent);
}

// Feed service missing `and`
let feedContent = fs.readFileSync(path.join(servicesDir, 'feed.service.ts'), 'utf8');
if (!feedContent.includes('and')) {
    feedContent = feedContent.replace(/import {([^}]+)} from "drizzle-orm";/, (match, group1) => {
        return `import { and, ${group1.trim()} } from "drizzle-orm";`;
    });
    fs.writeFileSync(path.join(servicesDir, 'feed.service.ts'), feedContent);
}

console.log("Repair done.");

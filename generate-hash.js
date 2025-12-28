/**
 * Generate bcrypt hash for passwords
 * Usage: node generate-hash.js <password>
 */

import bcrypt from 'bcrypt';

const password = process.argv[2] || 'admin123';
const saltRounds = 10;

bcrypt.hash(password, saltRounds).then(hash => {
    console.log('\n=== Bcrypt Hash Generated ===');
    console.log(`Password: ${password}`);
    console.log(`Hash: ${hash}`);
    console.log('\nCopy this hash to your migration file!\n');
}).catch(err => {
    console.error('Error:', err);
});

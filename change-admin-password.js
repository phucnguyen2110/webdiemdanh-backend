/**
 * Change admin password
 * Usage: node change-admin-password.js <new_password>
 */

import bcrypt from 'bcrypt';
import { usersDB } from './database-supabase.js';

const args = process.argv.slice(2);

if (args.length === 0) {
    console.log('Usage: node change-admin-password.js <new_password>');
    console.log('   OR: node change-admin-password.js <target_username> <new_password>');
    console.log('   OR: node change-admin-password.js <target_username> <new_password> <new_username_to_rebrand>');
    console.log('Example: node change-admin-password.js admin123321 MyNewPassword123 admin');
    process.exit(1);
}

let targetUsername = 'admin';
let newPassword = '';
let newUsername = null;

// Case 1: node change-admin-password.js <new_password> (assumes target 'admin')
if (args.length === 1) {
    newPassword = args[0];
}
// Case 2: node change-admin-password.js <target_username> <new_password>
else if (args.length >= 2) {
    targetUsername = args[0];
    newPassword = args[1];

    // Case 3: Rename user
    if (args.length >= 3) {
        newUsername = args[2];
    }
}

if (newPassword.length < 6) {
    console.log('❌ Password must be at least 6 characters');
    process.exit(1);
}

async function changeAdminPassword() {
    try {
        console.log(`\n🔐 Updating user '${targetUsername}'...\n`);

        // Find user
        const user = await usersDB.findByUsername(targetUsername);
        if (!user) {
            console.log(`❌ User '${targetUsername}' not found.`);
            process.exit(1);
        }

        // Prepare updates
        const updates = {};

        // Hash new password
        const saltRounds = 10;
        updates.password = await bcrypt.hash(newPassword, saltRounds);

        // Rename if requested
        if (newUsername) {
            console.log(`Checking availability of username '${newUsername}'...`);
            // Check if new username exists
            const existing = await usersDB.findByUsername(newUsername);
            if (existing) {
                console.log(`❌ Username '${newUsername}' already exists. Cannot rename.`);
                process.exit(1);
            }

            updates.username = newUsername;
        }

        // Update user
        await usersDB.update(user.id, updates);

        console.log('✅ Account updated successfully!');
        if (newUsername) {
            console.log(`   Old Username: ${targetUsername}`);
            console.log(`   New Username: ${newUsername}`);
        } else {
            console.log(`   Username: ${targetUsername}`);
        }
        console.log(`   New Password: ${newPassword}`);
        console.log(`\n⚠️  Please keep this password safe!\n`);
        process.exit(0);

    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

changeAdminPassword();

/**
 * Change admin password
 * Usage: node change-admin-password.js <new_password>
 */

import bcrypt from 'bcrypt';
import { usersDB } from './database-supabase.js';

const newPassword = process.argv[2];

if (!newPassword) {
    console.log('Usage: node change-admin-password.js <new_password>');
    console.log('Example: node change-admin-password.js MyNewPassword123');
    process.exit(1);
}

if (newPassword.length < 6) {
    console.log('❌ Password must be at least 6 characters');
    process.exit(1);
}

async function changeAdminPassword() {
    try {
        console.log('\n🔐 Changing admin password...\n');

        // Find admin user
        const admin = await usersDB.findByUsername('admin');
        if (!admin) {
            console.log('❌ Admin user not found. Please run migration first.');
            process.exit(1);
        }

        // Hash new password
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

        // Update password
        await usersDB.update(admin.id, { password: hashedPassword });

        console.log('✅ Admin password changed successfully!');
        console.log(`   Username: admin`);
        console.log(`   New password: ${newPassword}`);
        console.log(`\n⚠️  Please keep this password safe!\n`);

    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

changeAdminPassword();

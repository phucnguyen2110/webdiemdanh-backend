import { supabase } from './supabase.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const BUCKET_NAME = process.env.SUPABASE_STORAGE_BUCKET || 'excel-files';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

/**
 * Storage Manager - Automatically uses Supabase Storage in production, local storage in development
 */
export const storageManager = {
    /**
     * Upload file to storage
     * @param {string} localFilePath - Path to local file
     * @param {string} fileName - Desired file name in storage
     * @returns {Promise<{success: boolean, filePath: string, url?: string}>}
     */
    uploadFile: async (localFilePath, fileName) => {
        if (IS_PRODUCTION) {
            // Production: Upload to Supabase Storage
            try {
                const fileBuffer = fs.readFileSync(localFilePath);

                // Upload to Supabase
                const { data, error } = await supabase.storage
                    .from(BUCKET_NAME)
                    .upload(fileName, fileBuffer, {
                        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                        upsert: true // Overwrite if exists
                    });

                if (error) throw error;

                // Get public URL
                const { data: urlData } = supabase.storage
                    .from(BUCKET_NAME)
                    .getPublicUrl(fileName);

                console.log(`✅ Uploaded to Supabase Storage: ${fileName}`);

                // Delete local file after successful upload
                try {
                    fs.unlinkSync(localFilePath);
                } catch (err) {
                    console.warn('Could not delete local temp file:', err.message);
                }

                return {
                    success: true,
                    filePath: `supabase://${BUCKET_NAME}/${fileName}`,
                    url: urlData.publicUrl
                };
            } catch (error) {
                console.error('Error uploading to Supabase Storage:', error);
                throw error;
            }
        } else {
            // Development: Use local storage
            console.log(`✅ Saved locally: ${localFilePath}`);
            return {
                success: true,
                filePath: localFilePath
            };
        }
    },

    /**
     * Download file from storage
     * @param {string} filePath - File path (can be local or supabase://)
     * @returns {Promise<Buffer>}
     */
    downloadFile: async (filePath) => {
        if (filePath.startsWith('supabase://')) {
            // Extract bucket and file name from path
            const pathParts = filePath.replace('supabase://', '').split('/');
            const bucket = pathParts[0];
            const fileName = pathParts.slice(1).join('/');

            try {
                const { data, error } = await supabase.storage
                    .from(bucket)
                    .download(fileName);

                if (error) throw error;

                // Convert Blob to Buffer
                const arrayBuffer = await data.arrayBuffer();
                return Buffer.from(arrayBuffer);
            } catch (error) {
                console.error('Error downloading from Supabase Storage:', error);
                throw error;
            }
        } else {
            // Local file
            if (!fs.existsSync(filePath)) {
                throw new Error(`File not found: ${filePath}`);
            }
            return fs.readFileSync(filePath);
        }
    },

    /**
     * Delete file from storage
     * @param {string} filePath - File path (can be local or supabase://)
     * @returns {Promise<boolean>}
     */
    deleteFile: async (filePath) => {
        if (filePath.startsWith('supabase://')) {
            // Extract bucket and file name from path
            const pathParts = filePath.replace('supabase://', '').split('/');
            const bucket = pathParts[0];
            const fileName = pathParts.slice(1).join('/');

            try {
                const { error } = await supabase.storage
                    .from(bucket)
                    .remove([fileName]);

                if (error) throw error;
                console.log(`✅ Deleted from Supabase Storage: ${fileName}`);
                return true;
            } catch (error) {
                console.error('Error deleting from Supabase Storage:', error);
                return false;
            }
        } else {
            // Local file
            try {
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                    console.log(`✅ Deleted local file: ${filePath}`);
                }
                return true;
            } catch (error) {
                console.error('Error deleting local file:', error);
                return false;
            }
        }
    },

    /**
     * Check if file exists
     * @param {string} filePath - File path (can be local or supabase://)
     * @returns {Promise<boolean>}
     */
    fileExists: async (filePath) => {
        if (filePath.startsWith('supabase://')) {
            // Extract bucket and file name from path
            const pathParts = filePath.replace('supabase://', '').split('/');
            const bucket = pathParts[0];
            const fileName = pathParts.slice(1).join('/');

            try {
                const { data, error } = await supabase.storage
                    .from(bucket)
                    .list(path.dirname(fileName), {
                        search: path.basename(fileName)
                    });

                if (error) return false;
                return data && data.length > 0;
            } catch (error) {
                return false;
            }
        } else {
            // Local file
            return fs.existsSync(filePath);
        }
    },

    /**
     * Get storage info
     */
    getStorageInfo: () => {
        return {
            isProduction: IS_PRODUCTION,
            storageType: IS_PRODUCTION ? 'Supabase Storage' : 'Local Storage',
            bucket: IS_PRODUCTION ? BUCKET_NAME : 'N/A'
        };
    }
};

export default storageManager;

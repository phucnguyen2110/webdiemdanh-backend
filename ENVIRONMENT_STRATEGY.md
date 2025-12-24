# 🎯 Environment Strategy

## 📊 Tổng Quan

Hệ thống tự động phân biệt Development và Production:

| | Development | Production |
|---|---|---|
| **Database** | ✅ Supabase PostgreSQL | ✅ Supabase PostgreSQL |
| **File Storage** | 📁 Local `uploads/` | ☁️ Supabase Storage |
| **Class Prefix** | `[DEV]` (tự động) | Không prefix |
| **Data Persistence** | ✅ Database: Vĩnh viễn<br>⚠️ Files: Tạm thời | ✅ Cả hai: Vĩnh viễn |

---

## 🔧 Cách Hoạt Động

### Development (Local)

```env
NODE_ENV=development  # hoặc không set
```

**Khi upload file Excel:**
1. Class name tự động thêm `[DEV]` prefix
   - Input: `Lớp 1A`
   - Saved: `[DEV] Lớp 1A`
2. Data (students, attendance) → Supabase PostgreSQL
3. File Excel → Local `uploads/` folder

**Ví dụ:**
```
User uploads: "Lớp 1A"
↓
System saves: "[DEV] Lớp 1A"
↓
Database: Supabase (với tên "[DEV] Lớp 1A")
File: d:\Prj_DiemDanh_Backend\uploads\DEV_Lop_1A_1234567890.xlsx
```

---

### Production (Deploy)

```env
NODE_ENV=production
```

**Khi upload file Excel:**
1. Class name KHÔNG thêm prefix
   - Input: `Lớp 1A`
   - Saved: `Lớp 1A`
2. Data (students, attendance) → Supabase PostgreSQL
3. File Excel → Supabase Storage

**Ví dụ:**
```
User uploads: "Lớp 1A"
↓
System saves: "Lớp 1A"
↓
Database: Supabase (với tên "Lớp 1A")
File: Supabase Storage → excel-files/Lop_1A_1234567890.xlsx
```

---

## 🎨 Phân Biệt Data Trên Supabase

### Cách 1: Nhìn Tên Class
- `[DEV] Lớp 1A` → Development data
- `Lớp 1A` → Production data

### Cách 2: Kiểm Tra File Path
```sql
SELECT name, excel_file_path FROM classes;
```

**Development:**
```
[DEV] Lớp 1A | d:\Prj_DiemDanh_Backend\uploads\...
```

**Production:**
```
Lớp 1A | supabase://excel-files/...
```

---

## 📝 Ví Dụ Thực Tế

### Scenario 1: Test Local

```bash
# .env
NODE_ENV=development

# Upload class "Lớp 2B"
# Result:
# - Database: [DEV] Lớp 2B
# - File: uploads/DEV_Lop_2B_1234567890.xlsx
```

### Scenario 2: Deploy Production

```bash
# Render/Railway environment
NODE_ENV=production

# Upload class "Lớp 2B"
# Result:
# - Database: Lớp 2B
# - File: Supabase Storage (excel-files bucket)
```

### Scenario 3: Cả Hai Cùng Lúc

**Supabase Dashboard → Tables → classes:**
```
id | name           | excel_file_path
---+----------------+----------------------------------
1  | [DEV] Lớp 1A   | d:\...\uploads\...
2  | [DEV] Lớp 2B   | d:\...\uploads\...
3  | Lớp 1A         | supabase://excel-files/...
4  | Lớp 2B         | supabase://excel-files/...
```

✅ Dễ dàng phân biệt!

---

## 🚀 Deployment Checklist

### Trước Khi Deploy:

- [ ] Đã test local với `NODE_ENV=development`
- [ ] Đã thấy class có prefix `[DEV]`
- [ ] File lưu trong `uploads/` folder

### Khi Deploy:

- [ ] Set `NODE_ENV=production` trên Render/Railway
- [ ] Verify Supabase credentials
- [ ] Verify bucket `excel-files` tồn tại

### Sau Khi Deploy:

- [ ] Upload test class
- [ ] Verify class KHÔNG có prefix `[DEV]`
- [ ] Check Supabase Storage → file có trong bucket
- [ ] Restart server → file vẫn còn ✅

---

## 🔍 Troubleshooting

### Vấn Đề: Class có prefix `[DEV]` trên Production

**Nguyên nhân:** `NODE_ENV` chưa được set thành `production`

**Giải pháp:**
```bash
# Trên Render/Railway, add environment variable:
NODE_ENV=production
```

### Vấn Đề: File không lên Supabase Storage

**Nguyên nhân:** 
1. `NODE_ENV` không phải `production`
2. Bucket `excel-files` chưa được tạo
3. Supabase credentials sai

**Giải pháp:**
1. Verify `NODE_ENV=production`
2. Tạo bucket `excel-files` (public)
3. Check `SUPABASE_URL` và `SUPABASE_ANON_KEY`

---

## 💡 Tips

### Xóa Data Development

```sql
-- Trên Supabase SQL Editor
DELETE FROM classes WHERE name LIKE '[DEV]%';
```

### Chuyển Dev Data Sang Prod

```sql
-- Remove [DEV] prefix
UPDATE classes 
SET name = REPLACE(name, '[DEV] ', '')
WHERE name LIKE '[DEV]%';
```

### Kiểm Tra Environment Khi Server Start

```bash
npm start
```

Output:
```
==================================================
🌍 Environment: DEVELOPMENT
📊 Database: Supabase PostgreSQL
📁 File Storage: Local (uploads/)
🏷️  Class Prefix: [DEV] (auto-added)
==================================================
```

---

## ✅ Summary

- ✅ **Development:** Prefix `[DEV]`, files local
- ✅ **Production:** No prefix, files cloud
- ✅ **Same database:** Dễ phân biệt bằng prefix
- ✅ **Automatic:** Không cần làm gì thêm!

🎉 **Hoàn hảo cho workflow dev → prod!**

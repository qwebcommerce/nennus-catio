/**
 * Bilingual dictionary of every error message the API can send, and the lookup used to
 * give each JSON error response both `errorAr` and `errorEn` (see bilingualErrors()).
 *
 * Routes keep sending `error` in whichever language they were written in; this file maps
 * that text to the other language. Add an entry here whenever a new error message is added
 * (`npm run check:errors` lists messages that are missing).
 *
 * - EXACT: [arabic, english] pairs, matched on the whole message (either side).
 * - PATTERNS: messages built from template strings. Placeholders such as {name} or {n}
 *   match any text and are written back into the other language. `also` lists extra
 *   source forms (e.g. old mixed Arabic/English texts) that map to the same pair.
 * - TERMS: words captured by a pattern (field labels, list items) that are translated
 *   before they are written back.
 */

const EXACT = [
  // ── General / app ─────────────────────────────────────────────────────────
  ["تعذر قراءة الطلب (JSON غير صالح أو تالف)", "Could not parse request (invalid JSON)"],
  ["طلب غير صالح", "Bad request"],
  ["خطأ في الخادم", "Server error"],
  ["تعذر الاتصال بقاعدة البيانات", "Could not connect to the database"],
  ["قاعدة البيانات غير متاحة مؤقتاً. أعد المحاولة بعد لحظات.", "Database unavailable. Please try again shortly."],
  ["مخطط قاعدة البيانات يحتاج إلى ترحيل. تواصل مع الدعم.", "Database schema needs migration. Contact support."],
  [
    "قاعدة البيانات غير متاحة مؤقتاً أو انتهت مهلة الاتصال. أعد المحاولة بعد لحظات. على الإنتاج تحقق من DATABASE_URL (مثلاً Transaction pooler مع pgbouncer=true وconnection_limit=1).",
    "Database is temporarily unavailable or the connection pool is exhausted. Retry shortly. On production use the Supabase Transaction pooler (port 6543) with pgbouncer=true&connection_limit=1.",
  ],
  [
    "مخطط قاعدة البيانات غير متزامن مع التطبيق (جدول أو عمود ناقص). على الخادم نفّذ: npx prisma migrate deploy. إذا توقفت الترحيلات بخطأ، راجع prisma migrate status ثم أصلح التعارض (مثلاً prisma migrate resolve) قبل إعادة المحاولة.",
    "The database schema is out of date (a table or column is missing). On the server run: npx prisma migrate deploy. If migrations stopped on an error, check prisma migrate status and resolve it (e.g. prisma migrate resolve) before retrying.",
  ],
  [
    "مخطط قاعدة البيانات غير متوافق (عمود أو جدول ناقص). نفّذ ترحيلات Prisma على الخادم: prisma migrate deploy",
    "The database schema is out of date (a column or table is missing). Run the Prisma migrations on the server: prisma migrate deploy",
  ],
  ["غير موجود", "Not found"],
  ["السجل غير موجود", "Record not found"],
  ["معرّف غير صالح", "Invalid ID"],
  ["لا توجد تغييرات", "Nothing to update"],
  ["لا توجد إعدادات للتحديث", "No settings to update"],
  ["غير مسموح", "Not allowed"],
  ["تاريخ غير صالح", "Invalid date"],
  ["تواريخ غير صالحة", "Invalid dates"],
  ["حالة غير صالحة", "Invalid status"],
  ["القائمة غير معروفة", "Unknown list"],
  ["فشلت عملية التنظيف", "cleanup failed"],
  ["المبلغ كبير جداً", "Amount too large"],
  ["تعذر الوصول إلى خدمة خارجية. حاول مرة أخرى.", "Could not reach an external service. Try again."],
  ["قسمة غير صالحة (المقسوم عليه يجب أن يكون أكبر من صفر)", "divRound needs d > 0"],

  // ── Security / auth / sessions ───────────────────────────────────────────
  ["طلب مرفوض (حماية CSRF)", "Request blocked (missing X-Requested-With header)"],
  ["غير مصرح", "Unauthorized"],
  ["صلاحية غير كافية", "Insufficient permission"],
  ["لا تملك صلاحية هذا الإجراء", "Insufficient permission for this action"],
  ["هذا الإجراء لمالك المؤسسة فقط", "Only the business owner can do this"],
  ["للمدراء فقط", "Managers only"],
  ["انتهت الجلسة — سجّل الدخول مجدداً", "Your session has ended. Sign in again."],
  ["محاولات تسجيل دخول كثيرة. انتظر قليلاً ثم أعد المحاولة.", "Too many sign-in attempts. Wait a moment and try again."],
  ["تم تجاوز حد الطلبات. حاول بعد لحظات.", "Too many requests. Try again in a moment."],
  ["المستخدم غير موجود", "User not found"],
  ["البريد وكلمة المرور مطلوبان", "Email and password are required"],
  ["هذا البريد مسجّل في أكثر من مؤسسة — أدخل رمز المؤسسة (slug)", "This email is registered with more than one business. Enter the business code (slug)."],
  ["بيانات الدخول غير صحيحة", "Email or password is incorrect"],
  ["هذا الحساب معطّل — تواصل مع مالك المؤسسة", "This account is deactivated — contact the owner"],
  ["البريد مطلوب", "Email is required"],
  ["كلمة المرور يجب أن تكون 8 أحرف على الأقل", "Use a password of at least 8 characters"],
  ["رابط إعادة التعيين غير صالح أو منتهي", "This reset link is not valid or has expired"],
  ["كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل", "Use a new password of at least 8 characters"],
  ["كلمة المرور الحالية غير صحيحة", "The current password is not correct"],
  ["اختر كلمة مرور مختلفة عن الحالية", "Choose a password different from the current one"],
  ["التوقيع غير صالح", "Invalid signature"],

  // ── Users / permissions / org settings ────────────────────────────────────
  ["البريد والاسم وكلمة المرور مطلوبة", "Email, name and password are required"],
  ["كلمة المرور يجب ألا تقل عن 6 أحرف", "Password must be at least 6 characters"],
  ["دور غير صالح", "Invalid role"],
  ["يجب تعيين فرع للمستخدم", "Assign a branch to this user"],
  ["فرع غير صالح", "Invalid branch"],
  ["البريد مسجّل مسبقاً في هذه المؤسسة", "This email is already used in this organisation"],
  ["لا يمكن تعديل حساب مالك المؤسسة (المشرف الأعلى)", "The owner account cannot be changed here"],
  ["لا يمكن تعطيل حسابك الحالي", "You cannot deactivate your own account"],
  ["تم بلوغ الحد الأقصى للمستخدمين (10)", "User limit reached (10)"],
  ["لم تُرسل أي تغييرات على الصلاحيات", "No permission updates provided"],
  ["لم تُرسل أي تعديلات على الصلاحيات", "No permission updates provided"],
  ["المؤسسة غير موجودة", "Organization not found"],
  ["أدخل اسم النشاط (حتى 120 حرفاً)", "Enter the business name (up to 120 characters)"],
  ["رسوم الزيارة المنزلية غير صالحة", "Home-visit fee is not valid (at most 2 decimals)"],
  ["رسوم الزيارة المنزلية غير صالحة", "Home-visit fee is not valid"],
  ["مدة الحجز يجب أن تكون بين 5 و120 دقيقة", "Hold time must be between 5 and 120 minutes"],
  ["مهلة الإلغاء يجب أن تكون من 0 إلى 336 ساعة", "Cancellation cut-off must be 0 to 336 hours"],
  ["الموقع غير موجود", "Location not found"],
  ["لا يمكن للموقع الإلكتروني البيع من سيارة", "The website cannot sell from a van"],
  ["الاسمان العربي والإنجليزي مطلوبان", "Arabic and English names are required"],

  // ── B2B / Wholesale (fix-ra) ──────────────────────────────────────────────
  ["اختر عميل شركة (فعّل «عميل شركة» في بطاقة العميل)", "Choose a business customer (tick “Business customer” on the customer card)"],
  ["لا يمكن إلغاء سند تسليم بعد تسليم البضاعة", "A delivery note cannot be cancelled once goods were delivered"],
  ["اختر سند تسليم واحداً على الأقل", "Choose at least one delivery note"],
  ["عدد سندات التسليم كبير جداً", "Too many delivery notes"],
  ["لا يمكن إصدار فاتورة بتاريخ لاحق", "An invoice cannot be dated in the future"],
  ["سند التسليم غير موجود", "Delivery note not found"],
  ["الفاتورة لعميل واحد — اختر سندات تسليم لنفس العميل", "An invoice is for one customer. Choose delivery notes of the same customer."],
  ["يمكن فوترة سندات التسليم المُسلَّمة فقط", "Only delivered delivery notes can be invoiced"],
  ["سند التسليم مُفوتر مسبقاً", "This delivery note is already invoiced"],
  ["الفاتورة ملغاة", "This invoice is cancelled"],
  ["لا يمكن إلغاء فاتورة عليها سندات قبض", "An invoice with cash receipts cannot be cancelled"],
  ["طريقة الدفع: نقداً أو تحويل بنكي", "Payment method must be cash or bank transfer"],
  ["الفاتورة غير موجودة", "Invoice not found"],
  ["الفاتورة مدفوعة بالكامل أو ملغاة", "This invoice is fully paid or cancelled"],
  ["المبلغ أكبر من المتبقي على الفاتورة", "The amount is more than the invoice balance"],
  ["تغيّرت الفاتورة. حاول مرة أخرى.", "The invoice changed. Try again."],
  ["نوع التصدير غير معروف", "Unknown export kind"],
  ["سند القبض غير موجود", "Cash receipt not found"],
  ["هذا سند تسليم لمبيعات الشركات — سجّل سند قبض على فاتورته", "This is a B2B delivery note. Record a cash receipt on its invoice."],
  ["عدّل سندات تسليم الشركات من تبويب مبيعات الشركات / الجملة", "Change B2B delivery notes from the B2B / Wholesale tab"],

  // ── Branches / locations ──────────────────────────────────────────────────
  ["اسم الفرع مطلوب", "Branch name is required"],
  ["الفرع غير موجود", "Branch not found"],
  ["لا يمكن حذف الفرع الوحيد في المؤسسة", "Cannot delete the only branch in the organization"],
  ["اسم الموقع طويل جداً (120 حرفاً كحد أقصى)", "The location name is too long (at most 120 characters)"],
  ["الموقع الرئيسي لا يمكن أن يكون سيارة", "The main location cannot be a van"],
  ["لا يمكن إيقاف الموقع الرئيسي — اختر موقعاً رئيسياً آخر أولاً", "The main location cannot be deactivated. Choose another main location first."],
  ["اختر موقعاً نشطاً كموقع رئيسي", "Choose an active location as the main location"],
  ["لا يمكن حذف الموقع الرئيسي — اختر موقعاً رئيسياً آخر أولاً", "The main location cannot be deleted. Choose another main location first."],
  ["يجب اختيار الفرع", "Choose the till location"],
  ["يجب تحديد الفرع", "Choose a location"],
  ["لا يمكن الوصول لفرع آخر", "This is another location"],

  // ── Catalog ──────────────────────────────────────────────────────────────
  ["رمز SKU مطلوب", "SKU code is required"],
  ["رمز SKU يقبل الحروف والأرقام والنقطة والشرطة السفلية والشرطة فقط", "SKU may only use letters, numbers, dot, underscore, and hyphen"],
  ["اختر فئة رئيسية", "Please select a parent category"],
  ["فئة غير صالحة", "Invalid category"],
  ["الفئة الفرعية موجودة مسبقاً في هذه الفئة", "Subcategory already exists in this category"],
  ["الفئة الفرعية غير موجودة", "Subcategory not found"],
  ["فئة فرعية غير صالحة", "Invalid subcategory"],
  ["رمز SKU موجود مسبقاً", "SKU code already exists"],
  ["رمز SKU غير موجود", "SKU not found"],
  ["توجد فئة بهذا الاسم مسبقاً", "A category with this name already exists"],
  ["الفئة غير موجودة", "Category not found"],
  ["لم يُعثر على المورد المفضّل", "Preferred supplier was not found"],

  // ── Products / images / import ───────────────────────────────────────────
  ["المنتج غير موجود", "Product not found"],
  [
    "لا يمكن حذف هذا المنتج لأن له مبيعات أو مرتجعات أو مشتريات أو حركة مخزون. أوقفه بدلاً من ذلك.",
    "This product has sales, refunds, purchases or stock activity, so it can't be deleted. Deactivate it instead.",
  ],
  ["لا يمكن حذف المنتج لأنه مرتبط بمبيعات/مرتجعات/مشتريات", "This product is linked to sales, refunds or purchases, so it can't be deleted"],
  ["تعارض بيانات فريدة (SKU أو باركود أو معرّف خارجي)", "Duplicate unique value (SKU, barcode or external ID)"],
  ["الفئة الفرعية لا تتبع الفئة المختارة", "Subcategory does not belong to the selected category"],
  ["يجب اختيار رمز SKU من الكتالوج", "SKU must be selected from the catalog"],
  ["رمز SKU لا يتبع الفئة الفرعية المختارة", "SKU does not belong to the selected subcategory"],
  ["فشل الرفع", "Upload failed"],
  ["ملف الصورة مطلوب (اسم الحقل: file)", "Image file is required (field name: file)"],
  ["يُقبل ملف Excel فقط (.xlsx أو .xls)", "Only Excel files (.xlsx or .xls) are accepted"],
  ["معرّف المنتج غير صالح", "Invalid productId"],
  ["يُسمح بصور JPEG أو PNG أو WebP فقط", "Only JPEG, PNG or WebP images are allowed"],
  ["رفع الملف فشل", "File upload failed"],
  ["لم يُرفع ملف", "No file was uploaded"],
  ["تعذر قراءة الملف", "Could not read the file"],
  ["لا توجد منتجات في الملف", "There are no products in the file"],
  ["حدّد فرعاً (branchId) لتطبيق المخزون", "Choose a location (branchId) to apply the stock to"],
  ["لا توجد منتجات للاستيراد", "There are no products to import"],
  ["الحد الأقصى 2000 منتج في العملية", "At most 2000 products per import"],
  ["الملف لا يحتوي ورقة عمل", "The file has no worksheet"],
  ["الطول والعرض والعمق يجب أن تكون صفراً أو رقماً موجباً", "Height, width, and depth must be zero or a positive number"],
  ["اسم المنتج بالإنجليزية مطلوب", "English product name is required"],
  ["اسم المنتج بالعربية مطلوب", "Arabic product name is required"],
  ["الفئة مطلوبة", "Category is required"],
  ["رابط الصورة مطلوب", "Image URL is required"],
  ["رابط الصورة يجب أن يبدأ بـ http(s) أو بمسار يبدأ بـ /", "Image URL must be http(s) or a path starting with /"],
  ["يجب تحديد الفرع للمخزون الأولي", "Choose a location for the opening stock"],
  ["الصورة غير موجودة", "Image not found"],
  ["يجب ألا يتجاوز حجم الصورة 2 ميغابايت", "Image must be 2 MB or smaller"],
  ["الملف ليس صورة JPEG أو PNG أو WebP صالحة", "The file is not a valid JPEG, PNG or WebP image"],
  ["تحتوي الصورة على شيفرة صفحة ويب وتم رفضها", "The image contains web page code and was refused"],
  ["أبعاد الصورة كبيرة جداً", "The image dimensions are too large"],
  ["المخزون الأولي يجب أن يكون عدداً صحيحاً", "Opening stock must be a whole number of zero or more"],
  ["مخزون الصنف يجب أن يكون عدداً صحيحاً", "Variant stock must be a whole number of zero or more"],
  ["المخزون لكل حجم — استلمه بأمر شراء أو عدّله لكل حجم بعد الحفظ", "This product keeps stock per variant. Receive or adjust each variant after saving."],
  ["اختر الحجم — مخزون هذا المنتج لكل حجم", "This product keeps stock per variant. Choose the variant."],
  ["حد المخزون المنخفض يجب أن يكون عدداً صحيحاً", "The low-stock level must be a whole number of zero or more"],
  ["تعذر توليد باركود فريد — أعد المحاولة", "Could not generate a unique barcode. Try again."],
  ["الباركود مستخدم لمنتج آخر في نفس المؤسسة", "This barcode is already used by another product"],
  ["سعر غير صالح", "Enter a valid price (at most 2 decimals)"],
  ["الاسمان بالإنجليزية والعربية مطلوبان", "English and Arabic names are required"],
  ["تكلفة غير صالحة", "Invalid cost (at most 2 decimals)"],
  ["باركود مكرر", "Duplicate barcode"],
  ["تعارض SKU أو بيانات فريدة", "SKU or another unique value is already used"],
  ["خطأ حفظ", "Could not save this row"],
  ["سعر غير صالح (رقمان عشريان كحد أقصى)", "Enter a valid price (at most 2 decimals)"],
  ["تكلفة الوحدة غير صالحة", "Invalid unit cost (at most 2 decimals)"],

  // ── Inventory / stock ────────────────────────────────────────────────────
  ["كمية غير صالحة", "Invalid quantity"],
  ["كمية غير كافية", "Not enough stock at this location"],
  ["الكمية يجب أن تكون عدداً صحيحاً موجباً", "Quantity must be a whole number of zero or more"],
  ["الكمية المعدودة يجب أن تكون عدداً صحيحاً", "A counted quantity must be a whole number of zero or more"],
  ["فرع المصدر والوجهة غير صالحين", "Invalid source/destination branch"],
  ["لا توجد بنود", "No lines"],
  ["لا توجد بنود للتحويل", "No transfer lines"],
  ["الموقع غير نشط", "Inactive location"],
  ["لا يمكن التحويل من موقع غير نشط أو إليه", "Stock cannot move into or out of an inactive location"],
  ["لا يمكن الجرد لفرع آخر", "You cannot count stock for another location"],
  ["فشل الجرد", "Stock count failed"],
  ["لا يمكن التحويل من فرع آخر", "You cannot transfer from another location"],
  ["فشل التحويل", "Transfer failed"],
  ["الكمية يجب أن تكون عدداً صحيحاً", "The change must be a whole number"],
  ["اذكر سبب تعديل المخزون", "Give a reason for the stock adjustment"],
  ["فشل التعديل", "Stock adjustment failed"],

  // ── Customers / accounts ─────────────────────────────────────────────────
  ["الاسم مطلوب", "Name is required"],
  ["رصيد الذمّة غير صالح", "Opening balance is not valid"],
  ["حد الائتمان غير صالح", "Credit limit is not valid (at most 2 decimals)"],
  ["حد الائتمان غير صالح", "Credit limit is not valid"],
  ["لا يمكن للكاشير تعيين رصيد افتتاحي", "A cashier cannot set an opening balance"],
  ["اسم الحيوان الأليف مطلوب", "Pet name is required"],
  ["العنوان مطلوب", "Address is required"],
  ["تعذر الحذف — قد تكون هناك مبيعات مرتبطة", "Could not delete — there may be linked sales"],
  ["هذا البريد مستخدم لعميل آخر", "This email already belongs to a customer"],
  ["العميل غير موجود", "Customer not found"],
  ["عميل غير موجود", "Customer not found"],
  ["العميل غير صالح", "Invalid customer"],
  ["فشل تحميل الحسابات", "Could not load the accounts"],
  ["فشل تحميل المعاملات", "Could not load the transactions"],
  ["طريقة دفع غير صالحة", "Invalid payment method"],
  ["لا يمكن التحصيل لفرع آخر", "You cannot collect payment for another location"],
  ["لا توجد جلسة صندوق مفتوحة — افتح الصندوق لاستلام نقد التحصيل", "There is no open till session — open the till to take cash for this payment"],
  ["لا يوجد رصيد مستحق لهذا العميل", "This customer has no balance due"],
  ["فشل التحصيل", "Could not record the payment"],

  // ── Suppliers / purchases / purchase orders ──────────────────────────────
  ["اسم المورد مطلوب", "Supplier name is required"],
  ["تعذر الحذف", "Could not delete"],
  ["أمر الشراء غير موجود", "Order not found"],
  ["أرسل أمر الشراء قبل الاستلام", "Send the order before receiving goods"],
  ["لا يمكن الاستلام في موقع غير نشط", "Goods cannot be received into an inactive location"],
  ["السطر غير موجود في الأمر", "A line is not on this order"],
  ["لا يمكن استلام أكثر من الكمية المتبقية في الأمر", "A receipt cannot take more than the quantity still on order"],
  ["أدخل كمية للاستلام", "Enter a quantity to receive"],
  ["اختر مورداً نشطاً — الاستلام يُنشئ فاتورة مورد", "Choose an active supplier: the receipt raises a supplier bill"],
  ["الكمية يجب أن تكون عدداً صحيحاً أكبر من صفر", "Each line needs a whole quantity above zero"],
  ["لا يمكن الاستلام لفرع آخر", "You cannot receive goods for another location"],
  ["تغيّر الأمر أثناء الاستلام. أعد المحاولة.", "The order changed while receiving. Try again."],
  ["فشل الاستلام", "Could not receive"],
  ["يُرسل أمر الشراء وهو مسودة فقط", "Only a draft can be sent"],
  ["لا يمكن إلغاء أمر تم استلامه", "A received order cannot be cancelled"],
  ["الأمر ملغى مسبقاً", "The order is already cancelled"],
  ["كل كمية مستلمة يجب أن تكون عدداً صحيحاً", "Each received quantity must be a whole number"],
  ["الفاتورة غير موجودة", "Bill not found"],
  ["لا يمكن أن تزيد الدفعة عن الرصيد المتبقي", "A payment cannot be larger than the balance"],
  ["تعذر تسجيل الدفعة", "Could not record the payment"],
  ["اختر مورداً نشطاً", "Choose an active supplier"],
  ["اختر الموقع الذي سيستلم البضاعة", "Choose the location that will receive the goods"],
  ["أضف سطراً واحداً على الأقل", "Add at least one line"],
  ["لم يُعثر على منتج في أحد الأسطر", "A line product was not found"],
  ["لم يُعثر على حجم في أحد الأسطر", "A line variant was not found"],
  ["لا يمكن طلب بضاعة إلى موقع غير نشط", "An inactive location cannot receive goods"],
  ["كل سطر يحتاج كمية وتكلفة وحدة (منزلتان عشريتان كحد أقصى)", "Each line needs a quantity and a unit cost (at most 2 decimals)"],
  ["أدخل مبلغ الدفعة (منزلتان عشريتان كحد أقصى)", "Enter a payment amount (at most 2 decimals)"],
  ["اختر الدفع نقداً أو من البنك", "Choose cash or bank"],

  // ── Expenses / reports / finance ─────────────────────────────────────────
  ["المبلغ غير صالح (رقمان عشريان كحد أقصى)", "Enter a valid amount (at most 2 decimals)"],
  ["المبلغ غير صالح (بحد أقصى منزلتين عشريتين)", "Enter a valid amount (at most 2 decimals)"],
  ["المبلغ غير صالح", "Enter a valid amount"],
  ["مبلغ غير صالح", "Enter a valid amount (at most 2 decimals)"],
  ["فئة مصروف غير صالحة", "Invalid expense category"],
  ["تاريخ المصروف مطلوب", "Expense date is required"],
  ["اختر الدفع من النقد أو من البنك", "Choose whether it was paid from cash or from the bank"],

  // ── Cash sessions / held carts ───────────────────────────────────────────
  ["الجلسة غير موجودة أو مُغلقة", "Session not found or already closed"],
  ["الجلسة غير موجودة", "Session not found"],
  ["لا يمكن فتح صندوق لفرع آخر", "You cannot open a till for another location"],
  ["يوجد جلسة مفتوحة لهذا الفرع", "This location already has an open till session"],
  ["المبلغ المعدود غير صالح", "The counted amount is not valid"],
  ["فشل تعليق السلة", "Could not hold the cart"],
  ["السلة فارغة", "The cart is empty"],
  ["يمكنك حذف تعليقاتك فقط", "You can only delete your own held carts"],
  ["لا توجد أصناف صالحة أو المخزون غير كافٍ", "No valid items, or not enough stock"],
  ["لا يمكن التعليق لفرع آخر", "You cannot hold a cart for another location"],

  // ── Sales / POS ──────────────────────────────────────────────────────────
  ["لا يمكن البيع من هذا الموقع. افتح صندوق متجر أو سيارة.", "This location cannot take a sale. Open a shop or van till."],
  ["طريقة الدفع غير معروفة", "Unknown payment method"],
  ["اختر عميلاً للبيع عند الاستلام", "Customer is required for cash on delivery"],
  ["عنوان التوصيل مطلوب للبيع عند الاستلام", "Delivery address is required for cash on delivery"],
  ["اختر عميلاً للبيع على الحساب (الآجل)", "Choose a customer for a sale on credit"],
  ["لا يمكن البيع لفرع آخر", "You cannot sell for another location"],
  ["خصم غير صالح", "Enter a valid discount (at most 2 decimals)"],
  ["كوبون غير صالح", "Invalid coupon"],
  ["لا يمكن تقسيم الدفع مع الدفع عند الاستلام", "Split payment cannot be used with cash on delivery"],
  ["لا يمكن تقسيم الدفع مع البيع على الحساب", "Split payment cannot be used with a sale on credit"],
  ["فوراً ورابط الدفع متاحان من سيارة البيع فقط", "Fawran and payment links are available from the van only"],
  ["أدخل رقم مرجع الدفع بعد تأكيد العميل", "Enter the payment reference after the customer confirms"],
  ["لا يمكن دفع جزئي مع تقسيم طرق الدفع", "A partial payment cannot be combined with a split payment"],
  ["هذا العميل غير مسموح له بالشراء على الحساب", "This customer is not approved to buy on credit"],
  ["هذه العملية ستتجاوز حد الائتمان للعميل", "This sale would pass the customer's credit limit"],
  ["مبلغ المدفوع غير صالح", "The amount paid is not valid"],
  ["المبلغ المدفوع يتجاوز إجمالي الفاتورة", "The amount paid is more than the sale total"],
  ["يجب اختيار عميلاً للبيع بالآجل (المتبقي على الحساب)", "Choose a customer to put the balance on credit"],
  ["لا توجد جلسة صندوق مفتوحة — افتح الصندوق من صفحة الصندوق قبل البيع النقدي", "There is no open till session — open the till from the Till page before a cash sale"],
  [
    "تقسيم الدفع يقتصر على نقد / بطاقة / إلكتروني — لا يُسمح بالآجل أو الدفع عند الاستلام داخل التقسيم",
    "A split payment can only use cash, card or online — credit and cash on delivery are not allowed in a split",
  ],
  ["فشل إتمام الطلب", "Checkout failed"], // shop sends the English text; POS sends the Arabic below
  ["فشل إتمام البيع", "Checkout failed"],
  ["مبلغ غير صالح في تقسيم الدفع", "Invalid amount in the split payment"],
  ["مدفوعات البطاقة تحتاج مفتاح SkipCash وكلمة السر", "Card payments need the SkipCash key and secret"],
  ["رابط الدفع متاح من صندوق السيارة فقط", "A payment link is for the van till"],
  ["أدخل المبلغ المطلوب (منزلتان عشريتان كحد أقصى)", "Enter the amount to collect (at most 2 decimals)"],
  ["فاتورة غير موجودة", "Sale not found"],

  // ── Refunds ──────────────────────────────────────────────────────────────
  ["اختر الفاتورة التي يُرجع منها", "A refund must name the sale it comes from"],
  ["طريقة الإرجاع غير معروفة", "Unknown refund method"],
  ["الفاتورة من فرع آخر", "This sale was taken at another location"],
  ["هذا الطلب غير مدفوع", "This order was not paid"],
  ["لا يوجد مبلغ مدفوع على هذه الفاتورة", "Nothing was paid on this sale"],
  ["الصنف غير موجود في الفاتورة", "This item is not on the sale"],
  ["مجموع المرتجعات يتجاوز المدفوع على الفاتورة", "Refunds cannot add up to more than was paid on the sale"],
  ["اختر طريقة إرجاع المبلغ", "Choose how the money is refunded"],
  ["لا توجد جلسة صندوق مفتوحة — افتح الصندوق قبل الإرجاع النقدي", "Open the till before giving a cash refund"],
  ["لا توجد أصناف للإرجاع", "There are no items to refund"],
  ["لا يمكن الإرجاع لفرع آخر", "You cannot refund for another location"],
  ["تعارض معرف المزامنة", "Sync ID conflict"],
  ["فشل تسجيل الإرجاع", "Could not record the refund"],
  ["مبلغ الإرجاع غير صالح", "Refund amount is not valid"],
  ["لا توجد دفعة مُحصّلة متبقية للإرجاع", "There is no captured payment left to refund"],
  ["اختر نقداً أو بنكاً لهذا الإرجاع", "Choose cash or bank for this refund"],
  ["لم تُرجع بوابة الدفع المبلغ", "The gateway did not refund the payment"],
  ["فشل الإرجاع", "Refund failed"],

  // ── Payments / gateway ───────────────────────────────────────────────────
  ["الدفعة ليست قيد الانتظار أو المراجعة", "This payment is not pending or under review"],
  ["التحقق من الدفعات يحتاج مفتاح SkipCash وكلمة السر", "Payment lookups need the SkipCash key and secret"],
  ["دفعة البوابة تخص طلباً آخر", "The gateway payment belongs to a different order"],
  ["الدفعة تحتاج مراجعة من الموظفين", "Payment needs staff review"],
  ["لا يوجد دفع إلكتروني للتحقق منه", "There is no gateway payment to check"],
  ["لا يوجد دفع إلكتروني للبحث عنه", "There is no gateway payment to look up"],
  ["لا يوجد دفع بانتظار المراجعة", "No payment is waiting for review"],
  ["لم يُرجع SkipCash الدفعة", "SkipCash did not return the payment"],
  ["أرجع SkipCash دفعة مختلفة", "SkipCash returned a different payment"],
  ["الإرجاع بالبطاقة يحتاج مفتاح SkipCash وكلمة السر", "Card refunds need the SkipCash key and secret"],
  ["لم يُرجع SkipCash المبلغ", "SkipCash did not refund the payment"],
  ["لم يُرجع SkipCash صفحة الدفع", "SkipCash did not return a payment page"],
  ["الدفع بالبطاقة غير مهيأ بعد. أضف مفتاح SkipCash وكلمة السر على الخادم.", "Card payment is not configured yet. Add the SkipCash key and secret on the server."],
  ["الدفع بالبطاقة غير مهيأ بعد.", "Card payment is not configured yet."],
  ["تعذر تحديد حالة الدفعة", "Could not resolve the payment"],

  // ── Storage / mail ───────────────────────────────────────────────────────
  ["البريد الإلكتروني غير مهيأ (RESEND_API_KEY / SHOP_FROM_EMAIL)", "Email is not configured (RESEND_API_KEY / SHOP_FROM_EMAIL)"],
  ["معرّف المؤسسة مطلوب لمفتاح التخزين", "organizationId is required for a storage key"],
  ["تخزين الملفات غير مهيأ", "File storage is not configured"],
  ["تعذّر الوصول إلى خدمة تخزين الملفات، حاول مرة أخرى", "Could not reach the file storage service. Try again."],
  ["تخزين الملفات غير متاح. حاول مرة أخرى.", "File storage is not available. Try again."],

  // ── Promotions ───────────────────────────────────────────────────────────
  ["هذا الرمز غير مفعّل", "That code is not active"],
  ["الاسم ونوع العرض مطلوبان", "Name and offer type are required"],
  ["العرض غير موجود", "Offer not found"],

  // ── Appointments / grooming ──────────────────────────────────────────────
  ["اسم الخدمة مطلوب", "Service name is required"],
  ["فشل إنشاء الخدمة", "Could not create the service"],
  ["اليوم والأوقات وسعة لا تقل عن واحد مطلوبة", "Weekday, times, and a capacity of at least one are required"],
  ["الخدمة غير صالحة", "Invalid service"],
  ["فشل إنشاء الموعد", "Could not create the booking"],
  ["تغيير الحالة غير مسموح", "This status change is not allowed"],
  ["يُؤكَّد الموعد بدفعه فقط", "A booking is confirmed only by its payment"],
  ["تغيّر الموعد. حدّث الصفحة وأعد المحاولة.", "The booking changed. Refresh and try again."],
  ["تعذر تعديل الموعد", "Could not update the booking"],
  ["هذا الموعد مدفوع مسبقاً. أرجع الدفعة الزائدة بدلاً من ذلك.", "This booking is already paid. Refund the extra payment instead."],
  ["الموعد غير نشط", "Booking is not active"],
  ["العميل ليس لديه بريد إلكتروني", "Customer has no email"],
  ["تُرسل التذكيرات بالبريد الإلكتروني فقط", "Only email reminders are sent"],
  ["تعذر جلب المواعيد", "Could not load the bookings"],
  ["اختر أحد الأوقات المتاحة", "Choose one of the offered times"],
  ["هذا الوقت خارج ساعات التجميل", "That time is outside grooming hours"],
  ["هذا الوقت لم يعد متاحاً", "That time is no longer free"],
  ["وقت الموعد غير صالح", "Invalid booking time"],
  ["لا يمكن الحجز في وقت مضى", "That time has already passed"],
  ["لا يمكن نقل هذا الموعد", "Only an upcoming booking can be moved, without a status change"],
  ["لا يمكن النقل إلى وقت مضى", "Cannot move a booking into the past"],
  ["الموعد غير موجود", "Booking not found"],
  ["اختر باقة وتاريخاً", "Choose a package and a date"],
  ["سجّل الدخول لعرض الحجوزات", "Sign in to see bookings"],
  ["سجّل الدخول لإلغاء الحجز", "Sign in to cancel a booking"],
  ["يمكن إلغاء الحجز وهو مؤكد فقط", "This booking can only be cancelled while it is confirmed"],
  ["تغيّر هذا الحجز. حدّث الصفحة وأعد المحاولة.", "This booking changed. Refresh and try again."],
  ["المتجر غير جاهز", "The shop is not ready"],
  ["المتجر غير جاهز", "Shop is not ready"],
  ["الاسم والبريد والهاتف واسم الحيوان وسلالته وعمره مطلوبة", "Name, email, phone, and the pet's name, breed, and age are required"],
  ["اختر وقتاً متاحاً", "Choose a free time"],
  ["هذه الباقة غير متاحة", "That package is not available"],
  ["عنوان الزيارة المنزلية مطلوب", "A home-visit address is required"],
  ["اختر منطقة للزيارة المنزلية", "Choose an area for the home visit"],
  ["الحجز يحتاج مستخدماً من الموظفين على الحساب", "A booking needs a staff user on the account"],
  ["فشل الحجز", "Booking failed"],
  ["الباقة غير موجودة", "Package not found"],

  // ── Delivery setup / vans ────────────────────────────────────────────────
  ["الفترة غير موجودة", "Window not found"],
  ["اسم المنطقة مطلوب", "Area name is required"],
  ["رسوم التوصيل يجب أن تكون صفراً أو أكثر بمنزلتين عشريتين كحد أقصى", "The delivery fee must be zero or more, with at most 2 decimals"],
  ["التسمية مطلوبة", "Label is required"],
  ["اليوم يجب أن يكون من 0 (الأحد) إلى 6 (السبت)", "Weekday must be 0 (Sunday) to 6 (Saturday)"],
  ["الأوقات يجب أن تكون بصيغة HH:MM بين 00:00 و23:59", "Times must be HH:MM between 00:00 and 23:59"],
  ["يجب أن تنتهي الفترة بعد بدايتها", "The window must end after it starts"],
  ["مطلوب مقعد واحد على الأقل", "At least one seat is required"],
  ["المنطقة غير موجودة", "Area not found"],
  ["الاسم ورقم اللوحة مطلوبان", "Name and plate are required"],
  ["اختر سيارة نشطة", "Choose an active van"],
  ["هذه السيارة مرتبطة بمركبة مسبقاً", "That van already has a vehicle"],

  // ── Online orders ────────────────────────────────────────────────────────
  ["هذا الطلب مؤكد مسبقاً. أرجع الدفعة الزائدة بدلاً من ذلك.", "This order is already confirmed. Refund the extra payment instead."],
  ["لا توجد دفعة بطاقة مؤكدة لهذا الطلب", "This order has no confirmed card payment"],
  ["تغيير الحالة هذا غير مسموح", "That status change is not allowed"],
  ["طلبات الاستلام تصبح جاهزة للاستلام", "Pickup orders become ready for pickup"],
  ["طلبات التوصيل تخرج للتوصيل", "Delivery orders go out for delivery"],
  ["تغيّر الطلب. حدّث الصفحة وأعد المحاولة.", "The order changed. Refresh and try again."],
  ["تعذر تحديث الطلب", "Could not update the order"],
  ["FleetWiz غير متصل. علّم الطلب «خرج للتوصيل» من هنا حتى يتم الربط.", "FleetWiz is not connected. Mark the order out for delivery here until it is."],
  ["يُرسل التوصيل المؤكد فقط", "Only a confirmed delivery can be sent"],
  ["لم يقبل FleetWiz الطلب", "FleetWiz did not accept the order"],
  ["الطلب غير موجود", "Order not found"],

  // ── Shop (customer website) ──────────────────────────────────────────────
  ["المتجر لم يُفتح بعد", "The shop is not open yet"],
  ["الاسم والبريد وكلمة مرور من 8 أحرف على الأقل مطلوبة", "Name, email, and a password of at least 8 characters are required"],
  ["يوجد حساب بهذا البريد. سجّل الدخول بدلاً من ذلك.", "An account with this email already exists. Sign in instead."],
  ["الرمز مفقود", "Missing token"],
  ["رابط التأكيد غير صالح", "This confirmation link is not valid"],
  ["انتهت صلاحية رابط التأكيد. سجّل مجدداً للحصول على رابط جديد.", "This confirmation link has expired. Register again to get a new one."],
  ["البريد أو كلمة المرور غير صحيحة", "Email or password is incorrect"],
  ["أكّد بريدك الإلكتروني قبل تسجيل الدخول", "Confirm your email before signing in"],
  ["رابط إعادة التعيين غير صالح", "This reset link is not valid"],
  ["سجّل الدخول للمتابعة", "Sign in to continue"],
  ["الحساب غير موجود", "Account not found"],
  ["اللغة يجب أن تكون ar أو en", "Language must be ar or en"],
  ["الحيوان الأليف غير موجود", "Pet not found"],
  ["أدخل الوزن", "Enter a weight"],
  ["هذا الحيوان مرتبط بطلب نقل", "This pet is on a relocation request"],
  ["العنوان غير موجود", "Address not found"],
  ["أدخل الكمية", "Enter a quantity"],
  ["يمكن إلغاء هذا الطلب قبل البدء بتجهيزه فقط", "This order can only be cancelled before it is being prepared"],
  ["تعذر الإلغاء", "Could not cancel"],
  ["اختر تاريخ التوصيل", "Choose a delivery date"],
  ["موقع البيع عبر الموقع الإلكتروني غير محدد", "The website selling location is not set"],
  ["الاسم والبريد والهاتف مطلوبة", "Name, email, and phone are required"],
  ["السلة فارغة", "The cart is empty"],
  ["عنوان التوصيل مطلوب", "A delivery address is required"],
  ["أدخل إحداثيَي الموقع على الخريطة معاً، أو اتركهما فارغين", "Enter both map pin coordinates, or leave them blank"],
  ["اختر منطقة التوصيل", "Choose a delivery area"],
  ["تاريخ التوصيل في الماضي", "The delivery date is in the past"],
  ["اختر تاريخ توصيل خلال الأيام التسعين القادمة", "Choose a delivery date within the next 90 days"],
  ["اختر فترة التوصيل", "Choose a delivery window"],
  ["هذه الفترة ليست في اليوم المختار", "That window is not on the chosen day"],
  ["فترة التوصيل هذه بدأت بالفعل اليوم", "That delivery window has already started today"],
  ["أحد المنتجات في السلة لم يعد متاحاً", "A product in the cart is no longer available"],
  ["هذا الحجم لا يتبع هذا المنتج", "That variant is not on this product"],
  ["فترة التوصيل هذه ممتلئة", "That delivery window is full"],
  ["إتمام الطلب في المتجر يحتاج مستخدماً من الموظفين على الحساب", "Shop checkout needs a staff user on the account"],
  ["تغيّر المخزون قبل اكتمال الدفع", "Stock changed before payment completed"],
  ["أُلغي الحجز قبل وصول الدفعة", "The hold was released before the payment arrived"],

  // ── Relocation ───────────────────────────────────────────────────────────
  ["أرفق ثلاثة مستندات كحد أقصى", "Attach up to three documents"],
  ["يجب أن يكون كل مستند أقل من 1.2 ميغابايت", "Each document must be under 1.2 MB"],
  ["يجب أن تكون المستندات بصيغة PDF أو JPEG أو PNG", "Documents must be PDF, JPEG or PNG files"],
  ["يمكن إرفاق كل مستند مرة واحدة", "Each document can be attached once"],
  ["ارفع المستندات مرة أخرى (لم يُعثر على ملف مرفوع أو لم يُفحص)", "Upload the documents again (an upload was not found or not checked)"],
  ["ارفع المستندات مرة أخرى (أحد الملفات المرفوعة استُخدم مسبقاً)", "Upload the documents again (an upload was already used)"],
  ["سجّل الدخول بحساب عميل", "Sign in with a customer account"],
  ["طلب النقل متاح للعملاء المسجلين فقط", "Only a registered customer can request relocation"],
  ["الوجهة مطلوبة", "A destination is required"],
  ["أضف الحيوانات الأليفة لهذا النقل", "Add the pets for this move"],
  ["اختر الحيوانات الأليفة من حسابك", "Choose pets from your account"],
  ["أرفق مستندات النقل", "Attach the relocation documents"],
  ["تعذر إرسال الطلب", "Could not submit the request"],
  ["الطلب غير موجود", "Request not found"],
  ["المستندات غير مطلوبة حالياً", "Documents are not being requested"],
  ["أرفق مستنداً", "Attach a document"],
  ["تعذرت إضافة المستندات", "Could not add the documents"],
  ["الرفع المباشر غير متاح. أرفق الملف بالنموذج.", "Direct upload is not available. Attach the file to the form."],
  ["اختر ملفاً", "Choose a file"],
  ["يجب ألا يتجاوز حجم كل مستند 10 ميغابايت", "Each document must be 10 MB or smaller"],
  ["ملفات مرفوعة كثيرة بانتظار الإرسال. أرسل الطلب أو حاول غداً.", "Too many uploads waiting. Submit the request or try again tomorrow."],
  ["الرفع المباشر غير متاح", "Direct upload is not available"],
  ["الملف المرفوع غير موجود", "Upload not found"],
  ["تغيّر الملف المرفوع. أعد المحاولة.", "The upload changed. Try again."],
  ["المستند غير موجود", "Document not found"],
  ["لا يوجد عرض سعر للدفع", "There is no quote to pay"],
  ["أرسل عرض سعر بمبلغ", "Send a quote with an amount"],
  ["هذا الطلب مدفوع. اختر إرجاع المبلغ كاملاً أو الاحتفاظ بالدفعة قبل الإلغاء.", "This request is paid. Choose to refund it in full or to keep the payment before cancelling."],
  ["اذكر سبب الاحتفاظ بالدفعة", "Give a reason for keeping the payment"],
  ["تغيّر الطلب. حدّث الصفحة وأعد المحاولة.", "The request changed. Refresh and try again."],
  ["راجع الطلب قبل إرسال عرض السعر", "Review the request before sending a quote"],
  ["سجّل دفعة نقدية أو تحويلاً بنكياً", "Record cash or a bank transfer"],
  ["أدخل مرجع التحويل البنكي", "Enter the bank transfer reference"],
  ["لا يوجد عرض سعر لتسجيله مدفوعاً", "There is no quote to mark paid"],
  ["يقبل الدفع الطلب المنتظر للدفع فقط. أرجع المبلغ بدلاً من ذلك.", "Only a request waiting for payment can accept it. Refund it instead."],
  ["رابط التنزيل غير صالح أو منتهي", "This download link is not valid or has expired"],
  ["سجّل الدخول بالحساب الذي يملك هذا المستند", "Sign in with the account that owns this document"],
  ["أدخل مبلغ العرض (منزلتان عشريتان كحد أقصى)", "Enter a quote amount (at most 2 decimals)"],

  // ── Notifications ────────────────────────────────────────────────────────
  ["تعذر جلب التنبيهات", "Could not load notifications"],
  ["تعذر حساب غير المقروء", "Could not count unread notifications"],
  ["تعذر تحديث حالة القراءة", "Could not update the read status"],
  // ── Added with the screen sweep ──────────────────────────────────────────
  ["النظام مشغول بعملية أخرى على نفس المخزون. حاول مرة أخرى.", "Another sale was updating the same stock at the same moment. Please try again."],
  ["أدخل الأوقات بصيغة HH:MM وسعة واحدة على الأقل", "Times as HH:MM and a capacity of at least one are required"],
  ["لا يمكن حذف هذه الفئة لأنها مستخدمة في منتجات أو عروض. انقل المنتجات إلى فئة أخرى أولاً.", "This category is used by products or offers, so it can't be deleted. Move those products to another category first."],
  ["لا يمكن حذف هذه الفئة الفرعية لأنها مستخدمة في منتجات. انقل المنتجات أولاً.", "This subcategory is used by products, so it can't be deleted. Move those products first."],
  ["يوجد نوع حيوان بهذا الاسم بالفعل", "A pet type with this name already exists"],
  ["مشغول، أعد المحاولة لاحقاً", "Busy, retry later"],
  ["لا يمكن حذف هذا المورد لأن له مشتريات أو أوامر شراء أو فواتير. أوقفه بدلاً من ذلك.", "This supplier has purchases, purchase orders or bills, so it can't be deleted. Deactivate it instead."],

  // ── Sales orders, payments, proofs, prepayments, freight, free goods ──────
  ["نوع الملف غير معروف", "Unknown file purpose"],
  ["اختر ملفاً لرفعه", "Choose a file to upload"],
  ["الملف أكبر من 10 ميغابايت", "The file is larger than 10 MB"],
  ["الملف ليس صورة JPEG أو PNG أو WebP أو ملف PDF", "The file is not a JPEG, PNG, WebP image or a PDF"],
  ["أرفق صورة أو ملف PDF لإثبات التحويل البنكي", "Attach a picture or PDF as proof of the bank transfer"],
  ["ملف الإثبات غير موجود — ارفعه مرة أخرى", "The proof file was not found. Upload it again."],
  ["ملف الإثبات مستخدم لدفعة أخرى", "This proof file is already attached to another payment"],
  ["ارفع ملف الإثبات بنفسك", "Upload the proof file yourself"],
  ["تعذّر قراءة الملف المرفوع", "The uploaded file could not be read"],
  ["عدد الأسطر كبير جداً", "Too many lines"],
  ["منتج غير موجود", "A line product was not found"],
  ["الصنف غير متاح", "This variant cannot be sold"],
  ["اختر صنفاً للمنتج", "Choose a variant for this product"],
  ["كمية غير صالحة (عدد صحيح أكبر من صفر، أو غرامات للوزن)", "Enter a whole quantity above zero (grams for weight goods)"],
  ["تغيير السعر للمدير أو المالك فقط", "Only a manager or the owner can change the price"],
  ["البضاعة المجانية للمدير أو المالك فقط", "Only a manager or the owner can give goods free"],
  ["الخصم أكبر من قيمة الطلب", "The discount is larger than the order value"],
  ["خطة الدفع 4 دفعات كحد أقصى", "A payment plan has at most 4 installments"],
  ["أدخل تاريخ استحقاق لكل دفعة", "Enter a due date for each installment"],
  ["نسبة الدفعة غير صالحة", "Enter an installment percent above 0 and up to 100"],
  ["مجموع الدفعات يجب أن يساوي إجمالي الطلب (100%)", "The installments must add up to the order total (100%)"],
  ["مجموع الدفعات يجب أن يساوي إجمالي الطلب", "The installments must add up to the order total"],
  ["طلب البيع غير موجود", "Sales order not found"],
  ["مدة السداد غير صالحة (0 إلى 365 يوماً)", "Payment terms must be 0 to 365 days"],
  ["لا توجد قيمة على أسطر الأمر لتوزيع الشحن عليها", "The order lines have no value to spread the freight over"],
  ["اختر عميلاً للطلب", "Choose the customer for the order"],
  ["اختر موقع البيع (موقع نشط)", "Choose an active selling location"],
  ["اكتب سبب إعطاء البضاعة مجاناً", "Enter the reason the goods are given free"],
  ["يمكن تعديل الأسطر في المسودة فقط", "Lines can be changed on a draft only"],
  ["الطلب مغلق", "This order is closed"],
  ["لا يمكن تغيير خطة الدفع بعد تسجيل دفعة", "The payment plan cannot change after a payment was recorded"],
  ["يمكن تأكيد المسودة فقط", "Only a draft can be confirmed"],
  ["اكتب سبب الإلغاء", "Enter the reason for cancelling"],
  ["لا يمكن إلغاء طلب تم تسليم جزء منه", "An order with delivered goods cannot be cancelled"],
  ["لا يمكن إلغاء طلب عليه دفعات مسجلة", "An order with recorded payments cannot be cancelled"],
  ["لا يمكن تسجيل دفعة بتاريخ لاحق", "A payment cannot be dated in the future"],
  ["سجّل الدفعات على طلب مؤكد فقط", "Record payments on a confirmed, open order"],
  ["لا توجد جلسة صندوق مفتوحة في موقع الطلب — افتح الصندوق لاستلام النقد", "No till session is open at the order's location. Open the till to take cash."],
  ["المبلغ أكبر من المتبقي على الطلب", "The payment is more than the order balance"],
  ["يمكن التسليم من طلب مؤكد لم يُسلَّم بالكامل", "Deliver from a confirmed order that is not fully delivered"],
  ["أدخل كمية للتسليم", "Enter a quantity to deliver"],
  ["السطر غير موجود في الطلب", "A line is not on this order"],
  ["لا يمكن تسليم أكثر من الكمية المتبقية", "A delivery cannot be more than the quantity still to deliver"],
  ["المخزون في موقع الطلب لا يكفي لهذا التسليم", "Not enough stock at the order's location for this delivery"],
  ["تغيّر الطلب أثناء التسليم. حاول مرة أخرى.", "The order changed while delivering. Try again."],
  ["عدد المرفقات كبير جداً (20 كحد أقصى)", "Too many attachments (at most 20)"],
  ["أمر الشراء ملغى", "This purchase order is cancelled"],
  ["الدفعة المقدمة أكبر من المتبقي غير المدفوع من قيمة الأمر", "The prepayment is more than the unpaid value of the order"],
  ["اختر شركة شحن (مورد مُعلَّم كشركة شحن)", "Choose a freight company (a supplier marked as freight)"],
  ["أضف الشحن لأمر شراء مُرسل (ليس مسودة أو ملغى)", "Add freight to a sent order (not a draft or cancelled order)"],
  ["الملف غير موجود", "File not found"],
  ["رابط التنزيل غير صالح أو انتهت صلاحيته", "This download link is not valid or has expired"],
  ["لا يمكن استرجاع بضاعة أُعطيت مجاناً", "Goods given free cannot be refunded"],
  // ── Transfers, van returns, damaged stock ────────────────────────────────
  ["التحويل غير موجود", "Transfer not found"],
  ["لا توجد بنود", "Add at least one item"],
  ["عدد القطع في الكرتونة يجب أن يكون عدداً صحيحاً 2 أو أكثر", "Pieces per carton must be a whole number of 2 or more"],
  ["اختر موظفاً نشطاً", "Choose an active staff member"],
  ["اختر مركبة نشطة", "Choose an active vehicle"],
  ["المرتجع غير موجود", "Van return not found"],
  ["هذا المرتجع لسيارة أخرى", "This return belongs to another van"],
  ["هذه المركبة لسيارة أخرى", "This vehicle belongs to another van"],
  ["المركبة غير موجودة", "Vehicle not found"],
  ["الصورة أكبر من 6 ميغابايت", "The photo must be 6 MB or smaller"],
  ["الصورة غير موجودة", "Photo not found"],
  ["البند التالف غير موجود", "Damaged stock not found"],
  ["تمت معالجة هذا البند من قبل", "This damaged stock was already dealt with"],
  ["اختر طريقة الدفع: نقداً أو بطاقة أو تحويل بنكي", "Choose how it was paid: cash, card or bank transfer"],
  ["اختر طريقة الدفع: نقداً أو تحويل بنكي", "Choose how the customer was paid: cash or bank transfer"],
  ["لا يمكن أن يكون تاريخ الاستلام في المستقبل", "The return date cannot be in the future"],
  ["اختر سيارة بيع نشطة", "Choose an active van"],
  ["العميل غير موجود", "Customer not found"],
  ["اختر العميل أو اكتب اسمه أو هاتفه", "Choose the customer or type a name or phone"],
  ["لا يوجد مبلغ مستحق للعميل", "Nothing is owed to the customer"],
  ["تم دفع هذا المرتجع من قبل", "This return was already paid"],
  ["تم استلام هذا المرتجع من قبل", "This return was already received"],
  ["اختر المستودع أو الموقع المستلم", "Choose the warehouse or location receiving it"],
  ["ملف الإثبات أكبر من 6 ميغابايت", "The proof file must be 6 MB or smaller"],
  ["الإثبات يجب أن يكون صورة JPEG أو PNG أو WebP أو ملف PDF", "The proof must be a JPEG, PNG or WebP image or a PDF"],
  ["أرفق إثبات التحويل البنكي (صورة أو PDF)", "Attach the bank transfer proof (an image or a PDF)"],
  ["الإثبات غير موجود", "Payment proof not found"],
];

const PATTERNS = [
  { ar: "تم بلوغ الحد الأقصى للمستخدمين النشطين ({n})", en: "Active user limit reached ({n})" },
  { ar: "لا يوجد منتج بهذا الرمز: {code}", en: "No product with this code: {code}" },
  { ar: "أدخل كمية أكبر من صفر: {name}", en: "Enter a quantity above zero: {name}" },
  { ar: "وحدة غير معروفة: {name}", en: "Unknown unit: {name}" },
  { ar: "الكمية بالغرام يجب أن تكون عدداً صحيحاً: {name}", en: "Grams must be a whole number: {name}" },
  { ar: "هذا المنتج يُباع بالوزن، استخدم الكيلوغرام: {name}", en: "This product is sold by weight. Use kg: {name}" },
  { ar: "الكيلوغرام بثلاث خانات عشرية كحد أقصى: {name}", en: "Use at most 3 decimals for kg: {name}" },
  { ar: "الكيلوغرام للمنتجات الموزونة فقط: {name}", en: "kg is only for goods sold by weight: {name}" },
  { ar: "الكمية يجب أن تكون عدداً صحيحاً: {name}", en: "Quantity must be a whole number: {name}" },
  { ar: "لم يُحدَّد عدد القطع في الكرتونة: {name}", en: "Pieces per carton is not set: {name}" },
  { ar: "هذا المنتج لا يُحفظ في المخزون: {name}", en: "This product does not keep stock: {name}" },
  { ar: "اختر الحالة (سليم أو تالف): {name}", en: "Choose the condition (good or damaged): {name}" },
  { ar: "البند التالف يحتاج صورة: {name}", en: "A damaged line needs a photo: {name}" },
  // Catalog name validation (label is translated through TERMS)
  { ar: "{label} مطلوب", en: "{label} is required" },
  { ar: "{label} يجب ألا يقل عن {n} أحرف", en: "{label} must be at least {n} characters" },
  { ar: "{label} يجب ألا يتجاوز {n} حرفاً", en: "{label} must be at most {n} characters" },
  { ar: "{label} يقبل الحروف والأرقام والمسافات و - _ / & . ( ) فقط", en: "{label} may only use letters, numbers, spaces, and - _ / & . ( )" },
  { ar: "{label} يجب أن يحتوي على حرف واحد على الأقل", en: "{label} must include at least one letter" },
  { ar: "رمز SKU يجب ألا يقل عن {n} أحرف", en: "SKU must be at least {n} characters" },
  { ar: "رمز SKU يجب ألا يتجاوز {n} حرفاً", en: "SKU must be at most {n} characters" },

  // Money
  {
    ar: "أدخل مبلغاً صالحاً لـ {field} (منزلتان عشريتان كحد أقصى)",
    en: "Enter a valid amount for {field} (at most 2 decimals)",
    also: ["Enter a valid amount{} (at most 2 decimals)"],
  },
  { ar: "ليس مبلغاً صحيحاً بالدرهم: {v}", en: "Not a whole dirham amount: {v}" },
  { ar: "معامل غير صالح: {v}", en: "Bad factor: {v}" },

  // Stock / inventory
  { ar: "كمية غير كافية: {name}", en: "Insufficient quantity: {name}", also: ["Insufficient qty: {name}"] },
  { ar: "منتج غير صالح: {id}", en: "Invalid product: {id}" },
  { ar: "منتج غير موجود: {id}", en: "Product not found: {id}" },
  { ar: "الحجم غير تابع للمنتج: {name}", en: "Variant is not on {name}", also: ["الحجم غير تابع لـ {name}"] },
  { ar: "اختر الحجم لـ {name}", en: "Choose a variant for {name}" },
  { ar: "المخزون غير كافٍ لـ {name}", en: "Not enough stock for {name}" },
  { ar: "الحد الأقصى {n} فواتير معلّقة لكل مستخدم في الفرع", en: "At most {n} held carts per user at a location" },

  // Sales (old mixed Arabic/English texts are mapped too)
  { ar: "المنتج غير منشور: {name}", en: "This product is not published: {name}" },
  { ar: "وزن غير صالح: {name}", en: "Enter a weight in grams above zero: {name}", also: ["وزن غير صالح: {name} — Enter a weight above zero"] },
  { ar: "كمية غير صالحة: {name}", en: "Enter a whole quantity above zero: {name}", also: ["كمية غير صالحة: {name} — Enter a whole quantity above zero"] },
  { ar: "الصنف غير متاح: {name}", en: "This variant cannot be sold: {name}", also: ["الصنف غير متاح: {name} — This variant cannot be sold"] },
  { ar: "لا يوجد حجم نشط لهذا المنتج: {name}", en: "This product has no active variant: {name}", also: ["الصنف غير متاح: {name} — This product has no active variant"] },
  { ar: "اختر صنفاً: {name}", en: "Choose a variant: {name}" },
  { ar: "مجموع التقسيم ({a}) يجب أن يساوي المستحق ({b})", en: "The split total ({a}) must equal the amount due ({b})" },
  { ar: "كمية الإرجاع تتجاوز المتبقي في الفاتورة لـ {name}", en: "The refund is more than is left on the sale for {name}" },

  // Users
  { ar: "تم بلوغ الحد الأقصى للمستخدمين ({n})", en: "User limit reached ({n})" },

  // Branches
  {
    ar: "لا يمكن حذف الفرع لوجود بيانات مرتبطة: {list}. انقل المستخدمين أو اختر فرعاً بلا عمليات.",
    en: "Cannot delete branch while related data exists: {list}. Move users or choose a branch with no transactions.",
  },
  { ar: "{n} عملية بيع", en: "{n} sale(s)" },
  { ar: "{n} مستخدم مرتبط", en: "{n} linked user(s)" },
  { ar: "{n} جلسة صندوق", en: "{n} cash session(s)" },
  { ar: "{n} عملية إرجاع", en: "{n} refund(s)" },
  { ar: "{n} عملية شراء", en: "{n} purchase(s)" },
  { ar: "{n} سجل تدقيق", en: "{n} audit record(s)" },

  // Purchase orders
  { ar: "لا يمكن نقل الأمر من {a} إلى {b}", en: "Order cannot move from {a} to {b}" },

  // Payments / refunds
  { ar: "مبلغ الإرجاع أكبر من المتبقي للإرجاع ({amount} ر.ق)", en: "Refund amount is more than the {amount} QAR left to refund" },
  { ar: "مبلغ الإرجاع غير صالح. المتبقي للإرجاع {amount} ر.ق.", en: "Refund amount is not valid. {amount} QAR is left to refund." },
  { ar: "يجب أن تكون الدفعة بمبلغ العرض {amount} ر.ق", en: "The payment must be the quoted {amount} QAR" },
  { ar: "تعذر الوصول إلى SkipCash: {detail}", en: "SkipCash could not be reached: {detail}" },
  { ar: "فشل إرسال البريد عبر Resend ({code}): {detail}", en: "Resend {code}: {detail}" },

  // Appointments / grooming
  { ar: "لا يمكن تحويل موعد بحالة {a} إلى {b}", en: "A {a} booking cannot become {b}" },
  { ar: "يمكن إلغاء الحجز حتى {n} ساعة قبل موعده. يرجى التواصل معنا.", en: "Bookings can be cancelled up to {n} hours before they start. Please contact us." },
];

/** Internal or mixed-language texts that stand for one of the messages above. */
const ALIASES = {
  "reset used": "This reset link is not valid or has expired",
  // Node's fetch() failure text (payment gateway, delivery or mail service unreachable)
  "fetch failed": "Could not reach an external service. Try again.",
  "خصم غير صالح — Enter a valid discount (at most 2 decimals)": "Enter a valid discount (at most 2 decimals)",
};

/** Words captured by patterns (field labels, list items) — English → Arabic. */
const TERMS = {
  Name: "الاسم",
  Label: "التسمية",
  "Category name": "اسم الفئة",
  "Subcategory name": "اسم الفئة الفرعية",
  "English name": "الاسم بالإنجليزية",
  "house delivery fee": "رسوم التوصيل للمنزل",
  "variant price": "سعر الحجم",
};

/** Safe fallbacks when a message has no translation (never show the other language). */
export const FALLBACK_AR = "تعذّر إتمام الطلب.";
export const FALLBACK_EN = "The request could not be completed.";

const AR_RE = /[؀-ۿ]/;
export const isArabicText = (s) => typeof s === "string" && AR_RE.test(s);
export const isEnglishText = (s) => typeof s === "string" && !AR_RE.test(s) && /[A-Za-z]/.test(s);

const norm = (s) => String(s).replace(/\s+/g, " ").trim();
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const PH = /\{(\w*)\}/g;

const exactIndex = new Map();
for (const [ar, en] of EXACT) {
  const pair = { ar, en };
  if (!exactIndex.has(norm(ar))) exactIndex.set(norm(ar), pair);
  if (!exactIndex.has(norm(en))) exactIndex.set(norm(en), pair);
}
for (const [alias, target] of Object.entries(ALIASES)) exactIndex.set(norm(alias), exactIndex.get(norm(target)));
const termsAr = new Map(Object.entries(TERMS).map(([en, ar]) => [ar, en]));

/** Compiles "text {name} more" into an anchored regex plus the placeholder names in order. */
function compile(template) {
  const names = [];
  let re = "";
  let last = 0;
  for (const m of template.matchAll(PH)) {
    re += escapeRe(template.slice(last, m.index));
    // {n} / {amount} are numbers; anything else matches any text.
    re += m[1] === "n" || m[1] === "amount" ? "(-?[\\d.,]+)" : "(.*?)";
    names.push(m[1]);
    last = m.index + m[0].length;
  }
  re += escapeRe(template.slice(last));
  return { re: new RegExp(`^${re}$`, "s"), names };
}

const compiled = PATTERNS.map((p) => ({
  ...p,
  sources: [p.ar, p.en, ...(p.also || [])].map((t) => compile(t)),
}));
/** Every source form, most specific (longest fixed text) first, so "X: {name} — more" wins over "X: {name}". */
const sources = compiled
  .flatMap((p) => p.sources.map((src, i) => ({ pattern: p, ...src, fixed: [p.ar, p.en, ...(p.also || [])][i].replace(PH, "").length })))
  .sort((a, b) => b.fixed - a.fixed);

function fill(template, values) {
  return template.replace(PH, (_, name) => (name in values ? values[name] : ""));
}

/** Translates a value captured by a pattern into `lang` (known terms, messages, lists). */
function translateValue(value, lang, depth) {
  const v = String(value);
  if (!v.trim()) return v;
  if (lang === "ar" && TERMS[v]) return TERMS[v];
  if (lang === "en" && termsAr.has(v)) return termsAr.get(v);
  // Names, numbers, codes: written back unchanged.
  if (lang === "ar" ? isArabicText(v) : !isArabicText(v)) return v;
  if (depth < 2) {
    const t = lookup(v, depth + 1);
    if (t) return t[lang];
    if (/,|،/.test(v)) {
      return v
        .split(/\s*[,،]\s*/)
        .map((part) => translateValue(part, lang, depth + 1))
        .join(lang === "ar" ? "، " : ", ");
    }
  }
  return v;
}

function lookup(text, depth = 0) {
  const key = norm(text);
  const hit = exactIndex.get(key);
  if (hit) return hit;
  for (const src of sources) {
    {
      const p = src.pattern;
      const m = src.re.exec(key);
      if (!m) continue;
      const ar = {};
      const en = {};
      src.names.forEach((name, i) => {
        // The legacy "Enter a valid amount{} ..." form captures " for <field>".
        const value = name ? m[i + 1] : m[i + 1].replace(/^ for /, "");
        const key2 = name || "field";
        ar[key2] = translateValue(value, "ar", depth);
        en[key2] = translateValue(value, "en", depth);
      });
      return { ar: fill(p.ar, ar), en: fill(p.en, en) };
    }
  }
  return null;
}

/** Translation of one error message: { ar, en }, or null when the message is unknown. */
export function translateErrorMessage(text) {
  if (typeof text !== "string" || !text.trim()) return null;
  return lookup(text);
}

/** For the coverage check: does a source template ("Not enough stock for {}") have a pattern? */
export function coversTemplate(template) {
  const key = norm(template).replace(PH, "{}");
  return compiled.some((p) => [p.ar, p.en, ...(p.also || [])].some((t) => norm(t).replace(PH, "{}") === key));
}

/** Size of the dictionary (for reports). */
export const dictionarySize = { exact: EXACT.length, patterns: PATTERNS.length };

const warned = new Set();
function warnOnce(text) {
  const key = String(text).slice(0, 300);
  if (warned.has(key) || warned.size > 1000) return;
  warned.add(key);
  console.warn(`[i18n] untranslated error message: ${JSON.stringify(key)}`);
}

/**
 * Arabic and English for an error message. `known` holds the languages a route already set;
 * they are kept when written in the right script. Unknown text keeps its own language and
 * the other side gets a safe generic message (logged once so it can be added here).
 */
export function bilingualError(message, known = {}) {
  let ar = isArabicText(known.ar) ? known.ar : null;
  let en = isEnglishText(known.en) ? known.en : null;
  if (ar && en) return { ar, en };
  const texts = [...new Set([message, known.ar, known.en].filter((s) => typeof s === "string" && s.trim()))];
  for (const s of texts) {
    const t = lookup(s);
    if (t) {
      ar = ar || t.ar;
      en = en || t.en;
    }
    if (ar && en) return { ar, en };
  }
  if (!ar) ar = texts.find(isArabicText) || null;
  if (!en) en = texts.find(isEnglishText) || null;
  if (!ar || !en) {
    if (texts.length) warnOnce(texts[0]);
    ar = ar || FALLBACK_AR;
    en = en || FALLBACK_EN;
  }
  return { ar, en };
}

/**
 * Express middleware: every JSON error response (status >= 400, or { ok: false }) that
 * carries an error message also gets `errorAr` and `errorEn`. `error` is left as it is.
 */
export function bilingualErrors(_req, res, next) {
  const json = res.json.bind(res);
  const end = res.end.bind(res);
  // A bare `res.status(404).end()` still tells the client what was not found, in both languages.
  res.end = (chunk, ...rest) => {
    if (chunk == null && res.statusCode === 404 && !res.headersSent && !res.getHeader("content-type")) {
      return res.json({ error: "غير موجود", errorAr: "غير موجود", errorEn: "Not found" });
    }
    return end(chunk, ...rest);
  };
  res.json = (body) => {
    if (
      body &&
      typeof body === "object" &&
      !Array.isArray(body) &&
      (typeof body.error === "string" || typeof body.errorAr === "string" || typeof body.errorEn === "string") &&
      (res.statusCode >= 400 || body.ok === false)
    ) {
      const { ar, en } = bilingualError(body.error, { ar: body.errorAr, en: body.errorEn });
      if (ar !== body.errorAr || en !== body.errorEn) {
        body = { ...body, errorAr: ar, errorEn: en };
        if (typeof body.error !== "string") body.error = ar;
      }
    }
    // Row-level messages (e.g. Excel import results): { errors: [{ row, message }] }.
    if (body && typeof body === "object" && Array.isArray(body.errors) && body.errors.some((x) => typeof x?.message === "string")) {
      body = {
        ...body,
        errors: body.errors.map((x) => {
          if (!x || typeof x.message !== "string") return x;
          const { ar, en } = bilingualError(x.message, { ar: x.messageAr, en: x.messageEn });
          return { ...x, messageAr: ar, messageEn: en };
        }),
      };
    }
    return json(body);
  };
  next();
}

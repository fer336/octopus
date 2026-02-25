-- ============================================================
-- OctopusTrack — Script de creación de base de datos
-- Generado automáticamente desde los modelos SQLAlchemy
-- PostgreSQL 13+
-- ============================================================

-- Extensión necesaria para UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tabla: users
CREATE TABLE users (
	email VARCHAR(255) NOT NULL, 
	name VARCHAR(255) NOT NULL, 
	picture VARCHAR(500), 
	google_id VARCHAR(255) NOT NULL, 
	is_active BOOLEAN NOT NULL, 
	id UUID NOT NULL, 
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	deleted_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id)
);

CREATE INDEX ix_users_id ON users (id);
CREATE UNIQUE INDEX ix_users_google_id ON users (google_id);
CREATE UNIQUE INDEX ix_users_email ON users (email);

-- Tabla: businesses
CREATE TABLE businesses (
	owner_id UUID NOT NULL, 
	name VARCHAR(255) NOT NULL, 
	cuit VARCHAR(13) NOT NULL, 
	tax_condition VARCHAR(50) NOT NULL, 
	address VARCHAR(500), 
	city VARCHAR(100), 
	province VARCHAR(100), 
	postal_code VARCHAR(10), 
	phone VARCHAR(50), 
	email VARCHAR(255), 
	logo_url VARCHAR(500), 
	header_text TEXT, 
	sale_point VARCHAR(5), 
	last_quotation_number VARCHAR(8), 
	last_receipt_number VARCHAR(8), 
	last_invoice_a_number VARCHAR(8), 
	last_invoice_b_number VARCHAR(8), 
	last_invoice_c_number VARCHAR(8), 
	last_purchase_order_number VARCHAR(8), 
	arca_token TEXT, 
	arca_sign TEXT, 
	arca_token_expiration VARCHAR(30), 
	arca_cuit_representante VARCHAR(13), 
	arca_environment VARCHAR(20), 
	afipsdk_access_token VARCHAR(500), 
	afip_cert TEXT, 
	afip_key TEXT, 
	id UUID NOT NULL, 
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	deleted_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id), 
	FOREIGN KEY(owner_id) REFERENCES users (id)
);

CREATE INDEX ix_businesses_owner_id ON businesses (owner_id);
CREATE INDEX ix_businesses_id ON businesses (id);

-- Tabla: cash_registers
CREATE TABLE cash_registers (
	business_id UUID NOT NULL, 
	opened_by UUID NOT NULL, 
	closed_by UUID, 
	status cashregisterstatus NOT NULL, 
	opening_amount NUMERIC(12, 2) NOT NULL, 
	opened_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	closed_at TIMESTAMP WITHOUT TIME ZONE, 
	counted_cash NUMERIC(12, 2), 
	difference NUMERIC(12, 2), 
	difference_reason TEXT, 
	closing_pdf_path VARCHAR(500), 
	id UUID NOT NULL, 
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	deleted_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id), 
	FOREIGN KEY(business_id) REFERENCES businesses (id), 
	FOREIGN KEY(opened_by) REFERENCES users (id), 
	FOREIGN KEY(closed_by) REFERENCES users (id)
);

CREATE INDEX ix_cash_registers_id ON cash_registers (id);
CREATE INDEX ix_cash_registers_business_id ON cash_registers (business_id);

-- Tabla: categories
CREATE TABLE categories (
	business_id UUID NOT NULL, 
	parent_id UUID, 
	name VARCHAR(100) NOT NULL, 
	description TEXT, 
	id UUID NOT NULL, 
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	deleted_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id), 
	FOREIGN KEY(business_id) REFERENCES businesses (id), 
	FOREIGN KEY(parent_id) REFERENCES categories (id)
);

CREATE INDEX ix_categories_id ON categories (id);
CREATE INDEX ix_categories_business_id ON categories (business_id);
CREATE INDEX ix_categories_name ON categories (name);
CREATE INDEX ix_categories_parent_id ON categories (parent_id);

-- Tabla: clients
CREATE TABLE clients (
	business_id UUID NOT NULL, 
	name VARCHAR(255) NOT NULL, 
	document_type VARCHAR(10) NOT NULL, 
	document_number VARCHAR(20) NOT NULL, 
	tax_condition VARCHAR(50) NOT NULL, 
	street VARCHAR(255), 
	street_number VARCHAR(20), 
	floor VARCHAR(10), 
	apartment VARCHAR(10), 
	city VARCHAR(100), 
	province VARCHAR(100), 
	postal_code VARCHAR(10), 
	phone VARCHAR(50), 
	email VARCHAR(255), 
	notes TEXT, 
	current_balance NUMERIC(12, 2) NOT NULL, 
	credit_limit NUMERIC(12, 2), 
	id UUID NOT NULL, 
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	deleted_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id), 
	FOREIGN KEY(business_id) REFERENCES businesses (id)
);

CREATE INDEX ix_clients_business_id ON clients (business_id);
CREATE INDEX ix_clients_id ON clients (id);
CREATE INDEX ix_clients_document_number ON clients (document_number);
CREATE INDEX ix_clients_name ON clients (name);

-- Tabla: payment_methods
CREATE TABLE payment_methods (
	business_id UUID NOT NULL, 
	name VARCHAR(100) NOT NULL, 
	code VARCHAR(20) NOT NULL, 
	is_active BOOLEAN NOT NULL, 
	requires_reference BOOLEAN NOT NULL, 
	id UUID NOT NULL, 
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	deleted_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id), 
	FOREIGN KEY(business_id) REFERENCES businesses (id)
);

CREATE INDEX ix_payment_methods_id ON payment_methods (id);

-- Tabla: price_update_drafts
CREATE TABLE price_update_drafts (
	business_id UUID NOT NULL, 
	created_by UUID, 
	name VARCHAR(255) NOT NULL, 
	filter_category_id UUID, 
	filter_category_name VARCHAR(255), 
	filter_supplier_id UUID, 
	filter_supplier_name VARCHAR(255), 
	filter_search VARCHAR(255), 
	products_data TEXT NOT NULL, 
	product_count VARCHAR(10) NOT NULL, 
	id UUID NOT NULL, 
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	deleted_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id), 
	FOREIGN KEY(business_id) REFERENCES businesses (id) ON DELETE CASCADE, 
	FOREIGN KEY(created_by) REFERENCES users (id) ON DELETE SET NULL
);

CREATE INDEX ix_price_update_drafts_id ON price_update_drafts (id);
CREATE INDEX ix_price_update_drafts_business_id ON price_update_drafts (business_id);

-- Tabla: suppliers
CREATE TABLE suppliers (
	business_id UUID NOT NULL, 
	name VARCHAR(255) NOT NULL, 
	cuit VARCHAR(13), 
	phone VARCHAR(50), 
	email VARCHAR(255), 
	address VARCHAR(500), 
	city VARCHAR(100), 
	province VARCHAR(100), 
	contact_name VARCHAR(255), 
	notes TEXT, 
	default_discount_1 NUMERIC(5, 2) NOT NULL, 
	default_discount_2 NUMERIC(5, 2) NOT NULL, 
	default_discount_3 NUMERIC(5, 2) NOT NULL, 
	id UUID NOT NULL, 
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	deleted_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id), 
	FOREIGN KEY(business_id) REFERENCES businesses (id)
);

CREATE INDEX ix_suppliers_id ON suppliers (id);
CREATE INDEX ix_suppliers_name ON suppliers (name);
CREATE INDEX ix_suppliers_business_id ON suppliers (business_id);

-- Tabla: products
CREATE TABLE products (
	business_id UUID NOT NULL, 
	category_id UUID, 
	supplier_id UUID, 
	code VARCHAR(50) NOT NULL, 
	supplier_code VARCHAR(50), 
	description VARCHAR(500) NOT NULL, 
	details TEXT, 
	cost_price NUMERIC(12, 2) NOT NULL, 
	list_price NUMERIC(12, 2) NOT NULL, 
	discount_1 NUMERIC(5, 2) NOT NULL, 
	discount_2 NUMERIC(5, 2) NOT NULL, 
	discount_3 NUMERIC(5, 2) NOT NULL, 
	discount_display VARCHAR(20), 
	extra_cost NUMERIC(5, 2) NOT NULL, 
	net_price NUMERIC(12, 2) NOT NULL, 
	sale_price NUMERIC(12, 2) NOT NULL, 
	iva_rate NUMERIC(5, 2) NOT NULL, 
	current_stock INTEGER NOT NULL, 
	minimum_stock INTEGER NOT NULL, 
	unit VARCHAR(20) NOT NULL, 
	is_active BOOLEAN NOT NULL, 
	id UUID NOT NULL, 
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	deleted_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id), 
	FOREIGN KEY(business_id) REFERENCES businesses (id), 
	FOREIGN KEY(category_id) REFERENCES categories (id), 
	FOREIGN KEY(supplier_id) REFERENCES suppliers (id)
);

CREATE INDEX ix_products_business_id ON products (business_id);
CREATE INDEX ix_products_code ON products (code);
CREATE INDEX ix_products_id ON products (id);
CREATE INDEX ix_products_supplier_code ON products (supplier_code);
CREATE INDEX ix_products_description ON products (description);
CREATE INDEX ix_products_category_id ON products (category_id);
CREATE INDEX ix_products_supplier_id ON products (supplier_id);

-- Tabla: purchase_orders
CREATE TABLE purchase_orders (
	business_id UUID NOT NULL, 
	supplier_id UUID, 
	category_id UUID, 
	created_by UUID NOT NULL, 
	status purchaseorderstatus NOT NULL, 
	sale_point VARCHAR(4) NOT NULL, 
	number VARCHAR(8) NOT NULL, 
	subtotal NUMERIC(14, 2) NOT NULL, 
	total_iva NUMERIC(14, 2) NOT NULL, 
	total NUMERIC(14, 2) NOT NULL, 
	notes TEXT, 
	confirmed_at TIMESTAMP WITHOUT TIME ZONE, 
	id UUID NOT NULL, 
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	deleted_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id), 
	FOREIGN KEY(business_id) REFERENCES businesses (id), 
	FOREIGN KEY(supplier_id) REFERENCES suppliers (id), 
	FOREIGN KEY(category_id) REFERENCES categories (id), 
	FOREIGN KEY(created_by) REFERENCES users (id)
);

CREATE INDEX ix_purchase_orders_id ON purchase_orders (id);
CREATE INDEX ix_purchase_orders_supplier_id ON purchase_orders (supplier_id);
CREATE INDEX ix_purchase_orders_category_id ON purchase_orders (category_id);
CREATE INDEX ix_purchase_orders_business_id ON purchase_orders (business_id);
CREATE INDEX ix_purchase_orders_status ON purchase_orders (status);

-- Tabla: supplier_categories
CREATE TABLE supplier_categories (
	supplier_id UUID NOT NULL, 
	category_id UUID NOT NULL, 
	PRIMARY KEY (supplier_id, category_id), 
	FOREIGN KEY(supplier_id) REFERENCES suppliers (id) ON DELETE CASCADE, 
	FOREIGN KEY(category_id) REFERENCES categories (id) ON DELETE CASCADE
);


-- Tabla: supplier_category_discounts
CREATE TABLE supplier_category_discounts (
	supplier_id UUID NOT NULL, 
	category_id UUID NOT NULL, 
	discount_1 NUMERIC(5, 2) NOT NULL, 
	discount_2 NUMERIC(5, 2) NOT NULL, 
	discount_3 NUMERIC(5, 2) NOT NULL, 
	id UUID NOT NULL, 
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	deleted_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id), 
	FOREIGN KEY(supplier_id) REFERENCES suppliers (id), 
	FOREIGN KEY(category_id) REFERENCES categories (id)
);

CREATE INDEX ix_supplier_category_discounts_supplier_id ON supplier_category_discounts (supplier_id);
CREATE INDEX ix_supplier_category_discounts_category_id ON supplier_category_discounts (category_id);
CREATE INDEX ix_supplier_category_discounts_id ON supplier_category_discounts (id);

-- Tabla: vouchers
CREATE TABLE vouchers (
	business_id UUID NOT NULL, 
	client_id UUID NOT NULL, 
	created_by UUID, 
	voucher_type vouchertype NOT NULL, 
	status voucherstatus NOT NULL, 
	sale_point VARCHAR(5) NOT NULL, 
	number VARCHAR(8) NOT NULL, 
	date DATE NOT NULL, 
	due_date DATE, 
	general_discount NUMERIC(5, 2) NOT NULL, 
	subtotal NUMERIC(12, 2) NOT NULL, 
	iva_amount NUMERIC(12, 2) NOT NULL, 
	total NUMERIC(12, 2) NOT NULL, 
	cae VARCHAR(20), 
	cae_expiration DATE, 
	arca_response TEXT, 
	barcode VARCHAR(100), 
	qr_data TEXT, 
	notes TEXT, 
	internal_notes TEXT, 
	show_prices VARCHAR(1), 
	deleted_by UUID, 
	deletion_reason TEXT, 
	related_voucher_id UUID, 
	invoiced_voucher_id UUID, 
	id UUID NOT NULL, 
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	deleted_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id), 
	FOREIGN KEY(business_id) REFERENCES businesses (id), 
	FOREIGN KEY(client_id) REFERENCES clients (id), 
	FOREIGN KEY(created_by) REFERENCES users (id), 
	FOREIGN KEY(deleted_by) REFERENCES users (id) ON DELETE SET NULL, 
	FOREIGN KEY(related_voucher_id) REFERENCES vouchers (id), 
	FOREIGN KEY(invoiced_voucher_id) REFERENCES vouchers (id)
);

CREATE INDEX ix_vouchers_client_id ON vouchers (client_id);
CREATE INDEX ix_vouchers_invoiced_voucher_id ON vouchers (invoiced_voucher_id);
CREATE INDEX ix_vouchers_business_id ON vouchers (business_id);
CREATE INDEX ix_vouchers_voucher_type ON vouchers (voucher_type);
CREATE INDEX ix_vouchers_related_voucher_id ON vouchers (related_voucher_id);
CREATE INDEX ix_vouchers_id ON vouchers (id);

-- Tabla: cash_movements
CREATE TABLE cash_movements (
	cash_register_id UUID NOT NULL, 
	type cashmovementtype NOT NULL, 
	payment_method cashpaymentmethod NOT NULL, 
	amount NUMERIC(12, 2) NOT NULL, 
	description VARCHAR(255) NOT NULL, 
	voucher_id UUID, 
	created_by UUID NOT NULL, 
	id UUID NOT NULL, 
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	deleted_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id), 
	FOREIGN KEY(cash_register_id) REFERENCES cash_registers (id), 
	FOREIGN KEY(voucher_id) REFERENCES vouchers (id), 
	FOREIGN KEY(created_by) REFERENCES users (id)
);

CREATE INDEX ix_cash_movements_id ON cash_movements (id);
CREATE INDEX ix_cash_movements_cash_register_id ON cash_movements (cash_register_id);

-- Tabla: payments
CREATE TABLE payments (
	business_id UUID NOT NULL, 
	client_id UUID NOT NULL, 
	voucher_id UUID, 
	received_by UUID, 
	date DATE NOT NULL, 
	amount NUMERIC(12, 2) NOT NULL, 
	method paymentmethod NOT NULL, 
	reference VARCHAR(100), 
	check_bank VARCHAR(100), 
	check_date DATE, 
	notes TEXT, 
	id UUID NOT NULL, 
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	deleted_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id), 
	FOREIGN KEY(business_id) REFERENCES businesses (id), 
	FOREIGN KEY(client_id) REFERENCES clients (id), 
	FOREIGN KEY(voucher_id) REFERENCES vouchers (id), 
	FOREIGN KEY(received_by) REFERENCES users (id)
);

CREATE INDEX ix_payments_client_id ON payments (client_id);
CREATE INDEX ix_payments_id ON payments (id);
CREATE INDEX ix_payments_voucher_id ON payments (voucher_id);
CREATE INDEX ix_payments_business_id ON payments (business_id);

-- Tabla: price_history
CREATE TABLE price_history (
	product_id UUID NOT NULL, 
	changed_by UUID, 
	old_list_price NUMERIC(12, 2) NOT NULL, 
	old_net_price NUMERIC(12, 2) NOT NULL, 
	old_sale_price NUMERIC(12, 2) NOT NULL, 
	new_list_price NUMERIC(12, 2) NOT NULL, 
	new_net_price NUMERIC(12, 2) NOT NULL, 
	new_sale_price NUMERIC(12, 2) NOT NULL, 
	change_reason VARCHAR(255), 
	import_file VARCHAR(255), 
	id UUID NOT NULL, 
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	deleted_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id), 
	FOREIGN KEY(product_id) REFERENCES products (id), 
	FOREIGN KEY(changed_by) REFERENCES users (id)
);

CREATE INDEX ix_price_history_id ON price_history (id);
CREATE INDEX ix_price_history_product_id ON price_history (product_id);

-- Tabla: purchase_order_items
CREATE TABLE purchase_order_items (
	purchase_order_id UUID NOT NULL, 
	product_id UUID NOT NULL, 
	system_stock INTEGER NOT NULL, 
	counted_stock INTEGER, 
	quantity_to_order INTEGER NOT NULL, 
	unit_cost NUMERIC(12, 2) NOT NULL, 
	iva_rate NUMERIC(5, 2) NOT NULL, 
	subtotal NUMERIC(14, 2) NOT NULL, 
	iva_amount NUMERIC(14, 2) NOT NULL, 
	total NUMERIC(14, 2) NOT NULL, 
	id UUID NOT NULL, 
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	deleted_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id), 
	FOREIGN KEY(purchase_order_id) REFERENCES purchase_orders (id), 
	FOREIGN KEY(product_id) REFERENCES products (id)
);

CREATE INDEX ix_purchase_order_items_product_id ON purchase_order_items (product_id);
CREATE INDEX ix_purchase_order_items_id ON purchase_order_items (id);
CREATE INDEX ix_purchase_order_items_purchase_order_id ON purchase_order_items (purchase_order_id);

-- Tabla: voucher_items
CREATE TABLE voucher_items (
	voucher_id UUID NOT NULL, 
	product_id UUID NOT NULL, 
	code VARCHAR(50) NOT NULL, 
	description VARCHAR(500) NOT NULL, 
	quantity NUMERIC(12, 2) NOT NULL, 
	unit VARCHAR(20) NOT NULL, 
	unit_price NUMERIC(12, 2) NOT NULL, 
	discount_percent NUMERIC(5, 2) NOT NULL, 
	iva_rate NUMERIC(5, 2) NOT NULL, 
	iva_amount NUMERIC(12, 2) NOT NULL, 
	subtotal NUMERIC(12, 2) NOT NULL, 
	total NUMERIC(12, 2) NOT NULL, 
	line_number INTEGER NOT NULL, 
	id UUID NOT NULL, 
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	deleted_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id), 
	FOREIGN KEY(voucher_id) REFERENCES vouchers (id) ON DELETE CASCADE, 
	FOREIGN KEY(product_id) REFERENCES products (id)
);

CREATE INDEX ix_voucher_items_voucher_id ON voucher_items (voucher_id);
CREATE INDEX ix_voucher_items_id ON voucher_items (id);

-- Tabla: voucher_payments
CREATE TABLE voucher_payments (
	voucher_id UUID NOT NULL, 
	payment_method_id UUID NOT NULL, 
	amount NUMERIC(12, 2) NOT NULL, 
	reference VARCHAR(100), 
	id UUID NOT NULL, 
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	deleted_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id), 
	CONSTRAINT positive_amount CHECK (amount > 0), 
	FOREIGN KEY(voucher_id) REFERENCES vouchers (id) ON DELETE CASCADE, 
	FOREIGN KEY(payment_method_id) REFERENCES payment_methods (id)
);

CREATE INDEX ix_voucher_payments_id ON voucher_payments (id);

-- Tabla: client_accounts
CREATE TABLE client_accounts (
	client_id UUID NOT NULL, 
	voucher_id UUID, 
	payment_id UUID, 
	date DATE NOT NULL, 
	movement_type movementtype NOT NULL, 
	description VARCHAR(255) NOT NULL, 
	debit NUMERIC(12, 2) NOT NULL, 
	credit NUMERIC(12, 2) NOT NULL, 
	balance NUMERIC(12, 2) NOT NULL, 
	id UUID NOT NULL, 
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	deleted_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id), 
	FOREIGN KEY(client_id) REFERENCES clients (id), 
	FOREIGN KEY(voucher_id) REFERENCES vouchers (id), 
	FOREIGN KEY(payment_id) REFERENCES payments (id)
);

CREATE INDEX ix_client_accounts_date ON client_accounts (date);
CREATE INDEX ix_client_accounts_client_id ON client_accounts (client_id);
CREATE INDEX ix_client_accounts_id ON client_accounts (id);

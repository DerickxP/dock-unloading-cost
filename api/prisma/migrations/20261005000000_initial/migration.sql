-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "products" (
    "id" SERIAL NOT NULL,
    "ean" TEXT,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "name_norm" TEXT NOT NULL,
    "packaging" TEXT NOT NULL DEFAULT 'CX',
    "units_per_package" DOUBLE PRECISION NOT NULL DEFAULT 1,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_aliases" (
    "id" SERIAL NOT NULL,
    "kind" VARCHAR(10) NOT NULL,
    "key" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "source" VARCHAR(30),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stores" (
    "id" SERIAL NOT NULL,
    "cnpj" VARCHAR(14) NOT NULL,
    "nickname" VARCHAR(60) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" SERIAL NOT NULL,
    "access_key" VARCHAR(44) NOT NULL,
    "number" VARCHAR(9) NOT NULL,
    "series" VARCHAR(3) NOT NULL DEFAULT '1',
    "issue_date" DATE NOT NULL,
    "issuer_cnpj" VARCHAR(14) NOT NULL,
    "issuer_name" TEXT NOT NULL,
    "recipient_cnpj" VARCHAR(14) NOT NULL,
    "recipient_name" TEXT NOT NULL,
    "total_value" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "products_value" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "carrier_volumes" INTEGER NOT NULL DEFAULT 0,
    "species" VARCHAR(20) NOT NULL DEFAULT 'UN',
    "gross_weight" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "net_weight" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "volumes" INTEGER NOT NULL DEFAULT 0,
    "item_volumes" INTEGER NOT NULL DEFAULT 0,
    "items_weight" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "volume_mismatch" BOOLEAN NOT NULL DEFAULT false,
    "source" VARCHAR(10) NOT NULL,
    "status" VARCHAR(15) NOT NULL,
    "note" VARCHAR(500),
    "created_by" TEXT,
    "updated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "reconciled_at" TIMESTAMP(3),

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_items" (
    "id" SERIAL NOT NULL,
    "invoice_id" INTEGER NOT NULL,
    "seq" INTEGER NOT NULL,
    "ean" VARCHAR(14),
    "code" TEXT,
    "description" TEXT NOT NULL,
    "unit" VARCHAR(6) NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "value" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "volumes" INTEGER,
    "packaging_used" VARCHAR(10),
    "status" VARCHAR(20),

    CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "products_ean_idx" ON "products"("ean");

-- CreateIndex
CREATE INDEX "products_code_idx" ON "products"("code");

-- CreateIndex
CREATE INDEX "products_name_idx" ON "products"("name");

-- CreateIndex
CREATE INDEX "products_name_norm_idx" ON "products"("name_norm");

-- CreateIndex
CREATE UNIQUE INDEX "products_code_packaging_units_per_package_key" ON "products"("code", "packaging", "units_per_package");

-- CreateIndex
CREATE INDEX "product_aliases_code_idx" ON "product_aliases"("code");

-- CreateIndex
CREATE UNIQUE INDEX "product_aliases_kind_key_key" ON "product_aliases"("kind", "key");

-- CreateIndex
CREATE UNIQUE INDEX "stores_cnpj_key" ON "stores"("cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_access_key_key" ON "invoices"("access_key");

-- CreateIndex
CREATE INDEX "invoices_issue_date_idx" ON "invoices"("issue_date");

-- CreateIndex
CREATE INDEX "invoices_recipient_cnpj_issue_date_idx" ON "invoices"("recipient_cnpj", "issue_date");

-- CreateIndex
CREATE INDEX "invoices_issuer_cnpj_idx" ON "invoices"("issuer_cnpj");

-- CreateIndex
CREATE INDEX "invoices_source_status_idx" ON "invoices"("source", "status");

-- CreateIndex
CREATE INDEX "invoices_number_idx" ON "invoices"("number");

-- CreateIndex
CREATE INDEX "invoice_items_invoice_id_idx" ON "invoice_items"("invoice_id");

-- CreateIndex
CREATE INDEX "invoice_items_ean_idx" ON "invoice_items"("ean");

-- CreateIndex
CREATE INDEX "invoice_items_code_idx" ON "invoice_items"("code");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_items_invoice_id_seq_key" ON "invoice_items"("invoice_id", "seq");

-- AddForeignKey

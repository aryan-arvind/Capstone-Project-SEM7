from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Text, Boolean
from sqlalchemy.orm import relationship
from src.database.connection import Base

class Customer(Base):
    __tablename__ = "customers"

    customer_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String(150), nullable=False, index=True)
    email = Column(String(100), nullable=True)
    phone = Column(String(20), nullable=True)
    company = Column(String(150), nullable=True)
    address = Column(String(255), nullable=True)
    gstin = Column(String(20), nullable=True)
    credit_limit = Column(Float, default=100000.0)
    created_at = Column(DateTime, default=datetime.utcnow)

    invoices = relationship("Invoice", back_populates="customer", cascade="all, delete-orphan")
    orders = relationship("Order", back_populates="customer", cascade="all, delete-orphan")
    quotations = relationship("Quotation", back_populates="customer", cascade="all, delete-orphan")


class Product(Base):
    __tablename__ = "products"

    product_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String(150), nullable=False, index=True)
    category = Column(String(100), default="General")
    cost_price = Column(Float, nullable=False)
    selling_price = Column(Float, nullable=False)
    gst_rate = Column(Float, default=18.0)  # e.g., 5.0, 12.0, 18.0, 28.0
    stock_quantity = Column(Integer, default=0)
    reorder_level = Column(Integer, default=10)
    sku = Column(String(50), nullable=True, unique=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    suppliers = relationship("Supplier", back_populates="product", cascade="all, delete-orphan")
    order_items = relationship("OrderItem", back_populates="product")


class Supplier(Base):
    __tablename__ = "suppliers"

    supplier_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String(150), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.product_id"), nullable=True)
    product_name = Column(String(150), nullable=False, index=True)
    unit_price = Column(Float, nullable=False)
    moq = Column(Integer, default=1)
    available_quantity = Column(Integer, default=100)
    location = Column(String(100), nullable=False)
    delivery_days = Column(Integer, default=5)
    rating = Column(Float, default=4.5)
    contact_email = Column(String(100), nullable=True)
    contact_phone = Column(String(20), nullable=True)
    source = Column(String(50), default="IndiaMART Verified")  # e.g., "IndiaMART TrustSEAL Verified", "IndiaMART Star Supplier"

    product = relationship("Product", back_populates="suppliers")


class Order(Base):
    __tablename__ = "orders"

    order_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    customer_id = Column(Integer, ForeignKey("customers.customer_id"), nullable=False)
    order_date = Column(DateTime, default=datetime.utcnow)
    total_amount = Column(Float, default=0.0)
    status = Column(String(50), default="COMPLETED")  # PENDING, PROCESSING, COMPLETED, CANCELLED

    customer = relationship("Customer", back_populates="orders")
    items = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan")


class OrderItem(Base):
    __tablename__ = "order_items"

    item_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    order_id = Column(Integer, ForeignKey("orders.order_id"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.product_id"), nullable=False)
    quantity = Column(Integer, nullable=False)
    unit_price = Column(Float, nullable=False)
    total_price = Column(Float, nullable=False)

    order = relationship("Order", back_populates="items")
    product = relationship("Product", back_populates="order_items")


class Invoice(Base):
    __tablename__ = "invoices"

    invoice_id = Column(String(50), primary_key=True, index=True)  # e.g., INV-2026-001
    customer_id = Column(Integer, ForeignKey("customers.customer_id"), nullable=False)
    invoice_date = Column(DateTime, default=datetime.utcnow)
    amount = Column(Float, nullable=False)
    paid_amount = Column(Float, default=0.0)
    outstanding_amount = Column(Float, nullable=False)
    due_date = Column(DateTime, nullable=False)
    status = Column(String(50), default="UNPAID")  # PAID, UNPAID, PARTIAL, OVERDUE

    customer = relationship("Customer", back_populates="invoices")
    payments = relationship("Payment", back_populates="invoice", cascade="all, delete-orphan")


class Payment(Base):
    __tablename__ = "payments"

    payment_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    invoice_id = Column(String(50), ForeignKey("invoices.invoice_id"), nullable=False)
    payment_date = Column(DateTime, default=datetime.utcnow)
    amount = Column(Float, nullable=False)
    payment_mode = Column(String(50), default="NEFT/UPI")  # UPI, NEFT, RTGS, CHEQUE, CASH
    reference_no = Column(String(100), nullable=True)

    invoice = relationship("Invoice", back_populates="payments")


class Quotation(Base):
    __tablename__ = "quotations"

    quotation_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    quotation_number = Column(String(50), unique=True, index=True, nullable=False)
    date = Column(DateTime, default=datetime.utcnow)
    customer_id = Column(Integer, ForeignKey("customers.customer_id"), nullable=True)
    customer_name = Column(String(150), nullable=False)
    product_id = Column(Integer, nullable=True)
    product_name = Column(String(150), nullable=False)
    quantity = Column(Integer, nullable=False)
    unit_cost = Column(Float, nullable=False)
    desired_margin_pct = Column(Float, nullable=False)
    unit_price = Column(Float, nullable=False)
    subtotal = Column(Float, nullable=False)
    discount_pct = Column(Float, default=0.0)
    discount_amount = Column(Float, default=0.0)
    taxable_amount = Column(Float, nullable=False)
    gst_rate = Column(Float, nullable=False)
    gst_amount = Column(Float, nullable=False)
    final_amount = Column(Float, nullable=False)
    validity_days = Column(Integer, default=15)
    payment_terms = Column(String(200), default="50% Advance, balance against delivery")
    status = Column(String(50), default="PENDING")  # PENDING, ACCEPTED, REJECTED, EXPIRED
    pdf_path = Column(String(255), nullable=True)
    verified_by_agent = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    customer = relationship("Customer", back_populates="quotations")


class PurchaseOrder(Base):
    __tablename__ = "purchase_orders"

    po_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    po_number = Column(String(50), unique=True, index=True, nullable=False)
    supplier_id = Column(Integer, ForeignKey("suppliers.supplier_id"), nullable=False)
    supplier_name = Column(String(150), nullable=False)
    product_id = Column(Integer, nullable=True)
    product_name = Column(String(150), nullable=False)
    quantity = Column(Integer, nullable=False)
    unit_price = Column(Float, nullable=False)
    total_amount = Column(Float, nullable=False)
    expected_delivery_days = Column(Integer, default=5)
    created_date = Column(DateTime, default=datetime.utcnow)
    terms = Column(String(255), default="Standard Net 30 Commercial PO")
    status = Column(String(50), default="ISSUED")  # ISSUED, RECEIVED, CANCELLED
    pdf_path = Column(String(255), nullable=True)

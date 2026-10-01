import os
from datetime import datetime, timedelta
from src.database.connection import engine, Base, SessionLocal
from src.models.db_models import (
    Customer, Product, Supplier, Order, OrderItem, Invoice, Payment, Quotation, PurchaseOrder
)

def init_and_seed_db(force: bool = False):
    """
    Creates tables and seeds sample data for Indian MSME operations.
    """
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()

    try:
        # Check if already seeded
        if session.query(Product).count() > 0 and not force:
            print("Database already populated with MSME data.")
            return

        if force:
            session.query(Payment).delete()
            session.query(Invoice).delete()
            session.query(OrderItem).delete()
            session.query(Order).delete()
            session.query(PurchaseOrder).delete()
            session.query(Quotation).delete()
            session.query(Supplier).delete()
            session.query(Product).delete()
            session.query(Customer).delete()
            session.commit()

        # 1. Customers
        customers_data = [
            {
                "name": "Sharma Infotech Pvt Ltd",
                "email": "procurement@sharmainfotech.in",
                "phone": "+91 98201 44521",
                "company": "Sharma Infotech Pvt Ltd",
                "address": "B-402, Trade Center, Andheri East, Mumbai, MH - 400069",
                "gstin": "27AABCS1429B1Z2",
                "credit_limit": 250000.0
            },
            {
                "name": "Apex Logistics Solutions",
                "email": "finance@apexlogistics.co.in",
                "phone": "+91 98450 88219",
                "company": "Apex Logistics Solutions",
                "address": "Plot 18, Sector 18, Electronic City, Bengaluru, KA - 560100",
                "gstin": "29AABCA5512C1Z4",
                "credit_limit": 400000.0
            },
            {
                "name": "Reliable Engineering Works",
                "email": "accounts@reliableeng.org",
                "phone": "+91 98110 33410",
                "company": "Reliable Engineering Works",
                "address": "GIDC Estate, Phase 2, Vatva, Ahmedabad, GJ - 382445",
                "gstin": "24AAACR8820D1ZE",
                "credit_limit": 300000.0
            },
            {
                "name": "Greenfield Retailers Ltd",
                "email": "contact@greenfieldretail.com",
                "phone": "+91 97170 99423",
                "company": "Greenfield Retailers Ltd",
                "address": "UG-12, Ambience Mall, Gurugram, HR - 122002",
                "gstin": "06AABCG9123E1Z7",
                "credit_limit": 150000.0
            },
            {
                "name": "Vikas Tech Park Ltd",
                "email": "facilities@vikastechpark.com",
                "phone": "+91 99400 12567",
                "company": "Vikas Tech Park Ltd",
                "address": "Cyber Towers, Hitec City, Hyderabad, TS - 500081",
                "gstin": "36AABCV3319F1Z1",
                "credit_limit": 500000.0
            },
            {
                "name": "Rahul Sharma",
                "email": "rahul.sharma@sharmatraders.in",
                "phone": "+91 98102 33918",
                "company": "Sharma Commercial Interiors & Retail",
                "address": "Shop 14, Main Market, Lajpat Nagar II, New Delhi - 110024",
                "gstin": "07AAACS4412H1Z5",
                "credit_limit": 350000.0
            }
        ]

        cust_objs = []
        for c in customers_data:
            cust = Customer(**c)
            session.add(cust)
            cust_objs.append(cust)
        session.commit()

        # 2. Products
        products_data = [
            {
                "name": "Office Chair",
                "category": "Office Furniture",
                "cost_price": 3200.0,
                "selling_price": 4200.0,
                "gst_rate": 18.0,
                "stock_quantity": 35,
                "reorder_level": 20,
                "sku": "FURN-CHR-001"
            },
            {
                "name": "Laptop Stand",
                "category": "Office Accessories",
                "cost_price": 650.0,
                "selling_price": 950.0,
                "gst_rate": 18.0,
                "stock_quantity": 12,
                "reorder_level": 15,
                "sku": "ACC-LST-002"
            },
            {
                "name": "All-in-One Laser Printer",
                "category": "Office Electronics",
                "cost_price": 14500.0,
                "selling_price": 18500.0,
                "gst_rate": 18.0,
                "stock_quantity": 4,
                "reorder_level": 5,
                "sku": "ELEC-PRN-003"
            },
            {
                "name": "Executive Wooden Desk",
                "category": "Office Furniture",
                "cost_price": 8500.0,
                "selling_price": 11900.0,
                "gst_rate": 18.0,
                "stock_quantity": 8,
                "reorder_level": 10,
                "sku": "FURN-DSK-004"
            },
            {
                "name": "Commercial LED High Bay 50W",
                "category": "Lighting",
                "cost_price": 420.0,
                "selling_price": 699.0,
                "gst_rate": 12.0,
                "stock_quantity": 60,
                "reorder_level": 20,
                "sku": "LGT-LED-005"
            },
            {
                "name": "Hardcover Spiral Notebooks (Pack of 10)",
                "category": "Stationery",
                "cost_price": 280.0,
                "selling_price": 450.0,
                "gst_rate": 5.0,
                "stock_quantity": 150,
                "reorder_level": 30,
                "sku": "STAT-NBK-006"
            },
            {
                "name": "Ergonomic Mechanical Keyboard",
                "category": "IT Peripherals",
                "cost_price": 2100.0,
                "selling_price": 2999.0,
                "gst_rate": 18.0,
                "stock_quantity": 45,
                "reorder_level": 15,
                "sku": "IT-KBD-007"
            },
            {
                "name": "Wireless Optical Mouse",
                "category": "IT Peripherals",
                "cost_price": 350.0,
                "selling_price": 599.0,
                "gst_rate": 18.0,
                "stock_quantity": 80,
                "reorder_level": 25,
                "sku": "IT-MSE-008"
            }
        ]

        prod_objs = {}
        for p in products_data:
            prod = Product(**p)
            session.add(prod)
            session.flush()
            prod_objs[p["name"]] = prod
        session.commit()

        # 3. Suppliers (Real Indian B2B Wholesale Suppliers & Hubs)
        suppliers_data = [
            # Office Chair Suppliers
            {
                "name": "Bharat Seating Solutions Pvt Ltd",
                "product_id": prod_objs["Office Chair"].product_id,
                "product_name": "Office Chair",
                "unit_price": 3100.0,
                "moq": 50,
                "available_quantity": 350,
                "location": "Kirti Nagar Industrial Area, New Delhi",
                "delivery_days": 4,
                "rating": 4.7,
                "contact_email": "wholesale@bharatseating.com",
                "contact_phone": "+91 98101 22891",
                "source": "IndiaMART Star Supplier"
            },
            {
                "name": "Apex Ergonomics & Furnishings Ltd",
                "product_id": prod_objs["Office Chair"].product_id,
                "product_name": "Office Chair",
                "unit_price": 3200.0,
                "moq": 20,
                "available_quantity": 500,
                "location": "Bhiwandi Logistics Park, Thane / Mumbai",
                "delivery_days": 3,
                "rating": 4.8,
                "contact_email": "sales@apexfurnishings.in",
                "contact_phone": "+91 98220 11984",
                "source": "IndiaMART TrustSEAL Verified"
            },
            {
                "name": "Transteel Commercial Seating",
                "product_id": prod_objs["Office Chair"].product_id,
                "product_name": "Office Chair",
                "unit_price": 3450.0,
                "moq": 10,
                "available_quantity": 200,
                "location": "Peenya 2nd Stage, Bengaluru, KA",
                "delivery_days": 2,
                "rating": 4.9,
                "contact_email": "b2b@transteel.co.in",
                "contact_phone": "+91 99001 88412",
                "source": "IndiaMART Verified Exporter"
            },
            {
                "name": "Da Urban Commercial Ergonomics",
                "product_id": prod_objs["Office Chair"].product_id,
                "product_name": "Office Chair",
                "unit_price": 2950.0,
                "moq": 100,
                "available_quantity": 800,
                "location": "Narol Industrial Estate, Ahmedabad, GJ",
                "delivery_days": 6,
                "rating": 4.6,
                "contact_email": "orders@daurban-b2b.com",
                "contact_phone": "+91 98790 33411",
                "source": "IndiaMART Verified Manufacturer"
            },

            # Laptop Stand Suppliers
            {
                "name": "Matrix Ergonomics",
                "product_id": prod_objs["Laptop Stand"].product_id,
                "product_name": "Laptop Stand",
                "unit_price": 630.0,
                "moq": 25,
                "available_quantity": 400,
                "location": "Pune, Maharashtra",
                "delivery_days": 3,
                "rating": 4.7,
                "contact_email": "info@matrixergo.in",
                "contact_phone": "+91 98230 44102",
                "source": "IndiaMART TrustSEAL"
            },
            {
                "name": "Deccan Aluminium Fabricators",
                "product_id": prod_objs["Laptop Stand"].product_id,
                "product_name": "Laptop Stand",
                "unit_price": 590.0,
                "moq": 100,
                "available_quantity": 1000,
                "location": "Sanath Nagar, Hyderabad, TS",
                "delivery_days": 6,
                "rating": 4.4,
                "contact_email": "supplies@deccanfab.com",
                "contact_phone": "+91 94401 55678",
                "source": "IndiaMART Verified Manufacturer"
            },

            # Laser Printer Suppliers
            {
                "name": "Canon Direct Wholesale Hub",
                "product_id": prod_objs["All-in-One Laser Printer"].product_id,
                "product_name": "All-in-One Laser Printer",
                "unit_price": 14200.0,
                "moq": 2,
                "available_quantity": 40,
                "location": "Mount Road, Chennai, TN",
                "delivery_days": 3,
                "rating": 4.9,
                "contact_email": "wholesale@canonhub-in.com",
                "contact_phone": "+91 98400 99881",
                "source": "Brand Authorized Distributor"
            },
            {
                "name": "North India Imaging Systems",
                "product_id": prod_objs["All-in-One Laser Printer"].product_id,
                "product_name": "All-in-One Laser Printer",
                "unit_price": 13900.0,
                "moq": 10,
                "available_quantity": 25,
                "location": "Sector 62, Noida, UP",
                "delivery_days": 5,
                "rating": 4.6,
                "contact_email": "b2b@northimaging.com",
                "contact_phone": "+91 98180 77654",
                "source": "IndiaMART Star Supplier"
            },

            # Executive Desk Suppliers
            {
                "name": "Royal Woodcraft India",
                "product_id": prod_objs["Executive Wooden Desk"].product_id,
                "product_name": "Executive Wooden Desk",
                "unit_price": 8200.0,
                "moq": 5,
                "available_quantity": 60,
                "location": "Sitapura Industrial Area, Jaipur, RJ",
                "delivery_days": 6,
                "rating": 4.7,
                "contact_email": "jaipur@royalwoodcraft.in",
                "contact_phone": "+91 94140 22345",
                "source": "IndiaMART Verified Exporter"
            },

            # LED Lighting Suppliers
            {
                "name": "Surya Lumens Ltd",
                "product_id": prod_objs["Commercial LED High Bay 50W"].product_id,
                "product_name": "Commercial LED High Bay 50W",
                "unit_price": 400.0,
                "moq": 50,
                "available_quantity": 1200,
                "location": "Industrial Area, Faridabad, HR",
                "delivery_days": 4,
                "rating": 4.6,
                "contact_email": "ledsales@suryalumens.com",
                "contact_phone": "+91 98100 66789",
                "source": "IndiaMART TrustSEAL Verified"
            }
        ]

        for s in suppliers_data:
            supp = Supplier(**s)
            session.add(supp)
        session.commit()

        # 4. Invoices & Payments (Realistic overdue, outstanding, paid)
        now = datetime.utcnow()
        invoices_data = [
            # Overdue invoice 1: Sharma Infotech
            {
                "invoice_id": "INV-2026-001",
                "customer_id": cust_objs[0].customer_id,
                "invoice_date": now - timedelta(days=45),
                "amount": 78000.0,
                "paid_amount": 0.0,
                "outstanding_amount": 78000.0,
                "due_date": now - timedelta(days=15),
                "status": "OVERDUE"
            },
            # Outstanding (not overdue yet): Apex Logistics
            {
                "invoice_id": "INV-2026-002",
                "customer_id": cust_objs[1].customer_id,
                "invoice_date": now - timedelta(days=10),
                "amount": 145000.0,
                "paid_amount": 0.0,
                "outstanding_amount": 145000.0,
                "due_date": now + timedelta(days=5),
                "status": "UNPAID"
            },
            # Partially Paid: Greenfield Retailers
            {
                "invoice_id": "INV-2026-003",
                "customer_id": cust_objs[3].customer_id,
                "invoice_date": now - timedelta(days=20),
                "amount": 69000.0,
                "paid_amount": 34500.0,
                "outstanding_amount": 34500.0,
                "due_date": now + timedelta(days=10),
                "status": "PARTIAL"
            },
            # Overdue invoice 2: Vikas Tech Park
            {
                "invoice_id": "INV-2026-004",
                "customer_id": cust_objs[4].customer_id,
                "invoice_date": now - timedelta(days=50),
                "amount": 112000.0,
                "paid_amount": 0.0,
                "outstanding_amount": 112000.0,
                "due_date": now - timedelta(days=20),
                "status": "OVERDUE"
            },
            # Fully Paid: Reliable Engineering
            {
                "invoice_id": "INV-2026-005",
                "customer_id": cust_objs[2].customer_id,
                "invoice_date": now - timedelta(days=30),
                "amount": 92000.0,
                "paid_amount": 92000.0,
                "outstanding_amount": 0.0,
                "due_date": now - timedelta(days=5),
                "status": "PAID"
            }
        ]

        for inv_d in invoices_data:
            inv = Invoice(**inv_d)
            session.add(inv)
        session.commit()

        # Payments for partial and paid invoices
        payments_data = [
            {
                "invoice_id": "INV-2026-003",
                "payment_date": now - timedelta(days=15),
                "amount": 34500.0,
                "payment_mode": "NEFT",
                "reference_no": "NEFT-INDB-789211"
            },
            {
                "invoice_id": "INV-2026-005",
                "payment_date": now - timedelta(days=10),
                "amount": 92000.0,
                "payment_mode": "RTGS",
                "reference_no": "RTGS-HDFC-991204"
            }
        ]

        for p_d in payments_data:
            pay = Payment(**p_d)
            session.add(pay)
        session.commit()

        # 5. Sample Past Orders for Sales Velocity
        orders_data = [
            {"customer_id": cust_objs[2].customer_id, "days_ago": 12, "items": [(prod_objs["Office Chair"].product_id, 10, 4200.0)]},
            {"customer_id": cust_objs[1].customer_id, "days_ago": 8, "items": [(prod_objs["Laptop Stand"].product_id, 20, 950.0)]},
            {"customer_id": cust_objs[0].customer_id, "days_ago": 5, "items": [(prod_objs["Office Chair"].product_id, 5, 4200.0)]},
            {"customer_id": cust_objs[4].customer_id, "days_ago": 2, "items": [(prod_objs["All-in-One Laser Printer"].product_id, 2, 18500.0)]}
        ]

        for ord_info in orders_data:
            total = sum(q * p for _, q, p in ord_info["items"])
            ord_obj = Order(
                customer_id=ord_info["customer_id"],
                order_date=now - timedelta(days=ord_info["days_ago"]),
                total_amount=total,
                status="COMPLETED"
            )
            session.add(ord_obj)
            session.flush()

            for pid, qty, uprice in ord_info["items"]:
                item = OrderItem(
                    order_id=ord_obj.order_id,
                    product_id=pid,
                    quantity=qty,
                    unit_price=uprice,
                    total_price=qty * uprice
                )
                session.add(item)
        session.commit()

        print("Database initialized and populated successfully with realistic Indian MSME records!")
    except Exception as e:
        session.rollback()
        print(f"Error seeding DB: {e}")
        raise
    finally:
        session.close()

if __name__ == "__main__":
    init_and_seed_db(force=True)

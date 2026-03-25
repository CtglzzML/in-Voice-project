import asyncio
from src.db.supabase import assign_invoice_number, create_invoice_draft

async def main():
    user_id = "8412b4dd-7ee4-4915-86ed-4d5bec0f702f"
    session_id = "test-session"
    print("creating draft...")
    invoice_id = create_invoice_draft(user_id, session_id)
    print("invoice_id:", invoice_id)
    print("assigning number...")
    number = assign_invoice_number(invoice_id, user_id)
    print("assigned number:", number)

if __name__ == "__main__":
    asyncio.run(main())

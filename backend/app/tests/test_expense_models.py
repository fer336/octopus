"""
Tests para modelos ExpenseCategory y Expense (T2).
"""
from datetime import date
from decimal import Decimal
from uuid import uuid4

import pytest
from sqlalchemy import select

from app.models.expense import Expense, ExpenseCategory

pytestmark = pytest.mark.asyncio


class TestExpenseCategoryModel:
    """RED → ExpenseCategory se crea y persiste correctamente."""

    async def test_create_expense_category(self, db, business_a):
        """GREEN → Crear categoría de gasto con datos básicos."""
        cat = ExpenseCategory(
            name="Fletes",
            description="Gastos de flete y logística",
            business_id=business_a.id,
        )
        db.add(cat)
        await db.commit()

        assert cat.id is not None
        assert cat.name == "Fletes"
        assert cat.description == "Gastos de flete y logística"
        assert cat.is_active is True
        assert cat.created_at is not None

    async def test_category_name_unique(self, db, business_a):
        """GREEN → El nombre de categoría debe ser único."""
        cat1 = ExpenseCategory(name="Servicios", description="Servicios generales", business_id=business_a.id)
        db.add(cat1)
        await db.commit()

        cat2 = ExpenseCategory(name="Servicios", description="Duplicado", business_id=business_a.id)
        db.add(cat2)
        with pytest.raises(Exception):
            await db.commit()

    async def test_category_default_is_active(self, db, business_a):
        """GREEN → is_active debe ser True por defecto."""
        cat = ExpenseCategory(name="Test Activo", business_id=business_a.id)
        db.add(cat)
        await db.commit()

        assert cat.is_active is True

    async def test_category_description_optional(self, db, business_a):
        """GREEN → description debe ser opcional."""
        cat = ExpenseCategory(name="Sin Descripción", business_id=business_a.id)
        db.add(cat)
        await db.commit()

        result = await db.get(ExpenseCategory, cat.id)
        assert result.description is None


@pytest.mark.asyncio
class TestExpenseModel:
    """RED → Expense se crea y persiste correctamente."""

    async def test_create_expense(self, db, business_a, user_a):
        """GREEN → Crear gasto con datos básicos."""
        cat = ExpenseCategory(name="Fletes Test", business_id=business_a.id)
        db.add(cat)
        await db.flush()

        expense = Expense(
            business_id=business_a.id,
            category_id=cat.id,
            description="Flete proveedor XYZ",
            amount=Decimal("15000.50"),
            date=date(2026, 6, 15),
            payment_method="transfer",
            created_by=user_a.id,
        )
        db.add(expense)
        await db.commit()

        assert expense.id is not None
        assert expense.amount == Decimal("15000.50")
        assert expense.payment_method == "transfer"
        assert expense.category_id == cat.id

    async def test_expense_category_relationship(self, db, business_a, user_a):
        """GREEN → Expense accede a su categoría vía relationship."""
        cat = ExpenseCategory(name="Gastos Admin", business_id=business_a.id)
        db.add(cat)
        await db.flush()

        expense = Expense(
            business_id=business_a.id,
            category_id=cat.id,
            description="Papelería",
            amount=Decimal("2500.00"),
            date=date(2026, 6, 20),
            payment_method="cash",
            created_by=user_a.id,
        )
        db.add(expense)
        await db.commit()
        await db.refresh(expense, ["category"])

        assert expense.category is not None
        assert expense.category.name == "Gastos Admin"

    async def test_category_expenses_relationship(self, db, business_a, user_a):
        """GREEN → ExpenseCategory accede a sus gastos vía relationship."""
        cat = ExpenseCategory(name="Servicios Varios", business_id=business_a.id)
        db.add(cat)
        await db.flush()

        for i in range(3):
            expense = Expense(
                business_id=business_a.id,
                category_id=cat.id,
                description=f"Gasto {i}",
                amount=Decimal(f"{i+1}000.00"),
                date=date(2026, 6, 1),
                payment_method="cash",
                created_by=user_a.id,
            )
            db.add(expense)
        await db.commit()
        await db.refresh(cat, ["expenses"])

        assert len(cat.expenses) == 3

    async def test_expense_notes_optional(self, db, business_a, user_a):
        """GREEN → notes debe ser opcional."""
        cat = ExpenseCategory(name="Varios", business_id=business_a.id)
        db.add(cat)
        await db.flush()

        expense = Expense(
            business_id=business_a.id,
            category_id=cat.id,
            description="Gasto sin notas",
            amount=Decimal("100.00"),
            date=date(2026, 6, 22),
            payment_method="credit_card",
            created_by=user_a.id,
        )
        db.add(expense)
        await db.commit()

        assert expense.notes is None

    async def test_expense_creator_relationship(self, db, business_a, user_a):
        """GREEN → Expense accede al usuario creador."""
        cat = ExpenseCategory(name="Gastos Test Creator", business_id=business_a.id)
        db.add(cat)
        await db.flush()

        expense = Expense(
            business_id=business_a.id,
            category_id=cat.id,
            description="Gasto con creador",
            amount=Decimal("500.00"),
            date=date(2026, 6, 22),
            payment_method="mercadopago",
            created_by=user_a.id,
        )
        db.add(expense)
        await db.commit()
        await db.refresh(expense, ["creator"])

        assert expense.creator is not None
        assert expense.creator.id == user_a.id

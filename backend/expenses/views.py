from rest_framework import viewsets, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.authtoken.models import Token
from django.contrib.auth.models import User
from django.contrib.auth import authenticate
from django.utils import timezone
from .models import Expense, MonthlyBudget
from .serializers import ExpenseSerializer, MonthlyBudgetSerializer


class ExpenseViewSet(viewsets.ModelViewSet):
    serializer_class = ExpenseSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Expense.objects.filter(user=self.request.user).order_by('-date')

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class CurrentBudgetView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        month_tag = timezone.now().strftime("%Y-%m")
        item, _ = MonthlyBudget.objects.get_or_create(
            user=request.user,
            month_key=month_tag,
            defaults={'amount': 10000.00}
        )
        return Response(MonthlyBudgetSerializer(item).data)

    def post(self, request):
        month_tag = timezone.now().strftime("%Y-%m")
        item, _ = MonthlyBudget.objects.get_or_create(
            user=request.user,
            month_key=month_tag,
            defaults={'amount': 10000.00}
        )

        val = request.data.get('amount')
        if val is None or float(val) <= 0:
            return Response(
                {"error": "Enter a valid budget amount."},
                status=status.HTTP_400_BAD_REQUEST
            )

        item.amount = val
        item.save()
        return Response(MonthlyBudgetSerializer(item).data)


class RegisterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        uname = request.data.get('username', '').strip()
        uemail = request.data.get('email', '').strip()
        upass = request.data.get('password', '')

        if not uname or not upass:
            return Response(
                {"error": "Username and password are required."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if User.objects.filter(username=uname).exists():
            return Response(
                {"error": "Username already taken."},
                status=status.HTTP_400_BAD_REQUEST
            )

        acct = User.objects.create_user(username=uname, email=uemail, password=upass)
        tkn, _ = Token.objects.get_or_create(user=acct)
        return Response({
            "token": tkn.key,
            "username": acct.username,
            "email": acct.email
        }, status=status.HTTP_201_CREATED)


class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        uname = request.data.get('username', '').strip()
        upass = request.data.get('password', '')

        acct = authenticate(username=uname, password=upass)
        if not acct:
            return Response(
                {"error": "Invalid username or password."},
                status=status.HTTP_401_UNAUTHORIZED
            )

        tkn, _ = Token.objects.get_or_create(user=acct)
        return Response({
            "token": tkn.key,
            "username": acct.username,
            "email": acct.email
        })
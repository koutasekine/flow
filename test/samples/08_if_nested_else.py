a, b = map(float, input().split())
if a > b:
    if a > 10:
        print("a が大きい")
    else:
        print("a")
else:
    while b > a:
        b = b - 1
    print("b")

def absval(x):
    if x < 0:
        return -x
    return x

def show(v):
    print(v)
    return

a, b = map(int, input().split())
c = absval(a - b)
show(c)

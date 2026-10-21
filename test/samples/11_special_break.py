while True:
    x = int(input())
    if x < 0:
        break
    print(x)
for i in range(10):
    if i % 3 == 0:
        continue
    print(i)

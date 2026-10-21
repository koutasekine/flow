L = [3, 1, 2]
for x in L:
    for j in range(x):
        if j == 1:
            break
        print(x, j)
    if x == 2:
        continue
    print(x)

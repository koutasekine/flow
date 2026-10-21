def find(L, t):
    for i in range(len(L)):
        if L[i] == t:
            return i
    return -1

L = [1, 2, 3]
print(find(L, 2))
